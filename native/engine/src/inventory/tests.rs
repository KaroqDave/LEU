use super::*;

struct FakeRegistry {
    records: Vec<(Hive, View, String, Result<RawRecord, ReadError>)>,
    denied: Vec<(Hive, View)>,
}

impl RegistryReader for FakeRegistry {
    fn enumerate(
        &self,
        source: &RegistrySource,
        visit: &mut dyn FnMut(&str, Result<RawRecord, ReadError>) -> bool,
    ) -> Result<(), ReadError> {
        if self.denied.contains(&(source.hive, source.view)) {
            return Err(ReadError::AccessDenied);
        }
        for (hive, view, name, record) in &self.records {
            if *hive == source.hive && *view == source.view && !visit(name, record.clone()) {
                break;
            }
        }
        Ok(())
    }
}

fn named(name: &str) -> RawRecord {
    BTreeMap::from([(
        "DisplayName".to_owned(),
        RegistryValue::String(name.to_owned()),
    )])
}

#[test]
fn preserves_independent_registrations_and_stable_source_identity() {
    let records = sources()
        .into_iter()
        .map(|source| {
            (
                source.hive,
                source.view,
                "SameKey".to_owned(),
                Ok(named("Same name")),
            )
        })
        .collect();
    let reader = FakeRegistry {
        records,
        denied: vec![],
    };
    let inventory = collect(&reader);
    assert_eq!(inventory.status, InventoryStatus::Complete);
    assert_eq!(inventory.programs.len(), 3);
    let ids: std::collections::BTreeSet<_> = inventory
        .programs
        .iter()
        .map(|program| &program.id)
        .collect();
    assert_eq!(ids.len(), 3);
    let refreshed = collect(&reader);
    assert_eq!(inventory.programs[0].id, refreshed.programs[0].id);
    assert!(
        inventory
            .programs
            .iter()
            .any(|program| matches!(program.scope, Scope::User))
    );
}

#[test]
fn keeps_missing_metadata_unknown_and_skips_nameless_records() {
    let reader = FakeRegistry {
        records: vec![
            (
                Hive::CurrentUser,
                View::Shared,
                "NoMetadata".to_owned(),
                Ok(named("  工具 🧪  ")),
            ),
            (
                Hive::CurrentUser,
                View::Shared,
                "Unnamed".to_owned(),
                Ok(RawRecord::new()),
            ),
        ],
        denied: vec![],
    };
    let inventory = collect(&reader);
    assert_eq!(inventory.programs.len(), 1);
    let program = &inventory.programs[0];
    assert_eq!(program.name, "工具 🧪");
    assert!(
        program.publisher.is_none()
            && program.version.is_none()
            && program.install_location.is_none()
    );
    assert!(program.reported_size_bytes.is_none() && program.reported_install_date.is_none());
    assert_eq!(inventory.status, InventoryStatus::Complete);
}

#[test]
fn unicode_case_folding_cannot_collapse_registration_identity() {
    let inventory = collect(&FakeRegistry {
        records: ["İ", "i\u{307}"]
            .map(|key| {
                (
                    Hive::CurrentUser,
                    View::Shared,
                    key.to_owned(),
                    Ok(named("Same display name")),
                )
            })
            .to_vec(),
        denied: vec![],
    });
    assert_eq!(inventory.programs.len(), 2);
    assert_ne!(inventory.programs[0].id, inventory.programs[1].id);
}

#[test]
fn normalizes_sizes_dates_unicode_paths_and_system_components() {
    let mut record = named("Fixture");
    record.insert("EstimatedSize".to_owned(), RegistryValue::Dword(u32::MAX));
    record.insert(
        "InstallDate".to_owned(),
        RegistryValue::String("20240229".to_owned()),
    );
    record.insert(
        "InstallLocation".to_owned(),
        RegistryValue::String(r"C:\测试\Größe 🧪".to_owned()),
    );
    record.insert("SystemComponent".to_owned(), RegistryValue::Dword(1));
    let reader = FakeRegistry {
        records: vec![(
            Hive::LocalMachine,
            View::X86,
            "Fixture".to_owned(),
            Ok(record),
        )],
        denied: vec![],
    };
    let inventory = collect(&reader);
    let program = &inventory.programs[0];
    assert_eq!(
        program.reported_size_bytes,
        Some(u64::from(u32::MAX) * 1024)
    );
    assert_eq!(program.reported_install_date.as_deref(), Some("2024-02-29"));
    assert_eq!(
        program.install_location.as_deref(),
        Some(r"C:\测试\Größe 🧪")
    );
    assert!(program.system_component);
    assert_eq!(inventory.status, InventoryStatus::Complete);
}

#[test]
fn malformed_metadata_is_omitted_with_warnings_but_keeps_a_complete_list() {
    let mut record = named("Fixture");
    record.insert(
        "EstimatedSize".to_owned(),
        RegistryValue::String("42".to_owned()),
    );
    record.insert(
        "InstallDate".to_owned(),
        RegistryValue::String("20230229".to_owned()),
    );
    record.insert("Publisher".to_owned(), RegistryValue::Unreadable);
    record.insert("DisplayVersion".to_owned(), RegistryValue::Invalid);
    let inventory = collect(&FakeRegistry {
        records: vec![(
            Hive::CurrentUser,
            View::Shared,
            "Fixture".to_owned(),
            Ok(record),
        )],
        denied: vec![],
    });
    // Every registration is listed, so metadata warnings alone do not make the list partial.
    assert_eq!(inventory.status, InventoryStatus::Complete);
    assert_eq!(inventory.issues.len(), 4);
    assert!(inventory.programs[0].reported_size_bytes.is_none());
    assert!(inventory.programs[0].reported_install_date.is_none());
}

#[test]
fn unusable_display_names_hide_registrations_and_make_the_list_partial() {
    for value in [RegistryValue::Invalid, RegistryValue::Unreadable] {
        let inventory = collect(&FakeRegistry {
            records: vec![
                (
                    Hive::CurrentUser,
                    View::Shared,
                    "Good".to_owned(),
                    Ok(named("Good")),
                ),
                (
                    Hive::CurrentUser,
                    View::Shared,
                    "Broken".to_owned(),
                    Ok(BTreeMap::from([("DisplayName".to_owned(), value)])),
                ),
            ],
            denied: vec![],
        });
        assert_eq!(inventory.programs.len(), 1);
        assert_eq!(inventory.issues.len(), 1);
        assert_eq!(inventory.status, InventoryStatus::Partial);
    }
}

#[test]
fn flags_update_registrations_like_programs_and_features() {
    let mut child = named("Update for Fixture");
    child.insert(
        "ParentKeyName".to_owned(),
        RegistryValue::String("Fixture".to_owned()),
    );
    let mut hotfix = named("Security Update for Fixture");
    hotfix.insert(
        "ReleaseType".to_owned(),
        RegistryValue::String("security update".to_owned()),
    );
    let mut product = named("Fixture");
    product.insert(
        "ReleaseType".to_owned(),
        RegistryValue::String("Release".to_owned()),
    );
    let inventory = collect(&FakeRegistry {
        records: [("A", child), ("B", hotfix), ("C", product)]
            .map(|(key, record)| (Hive::LocalMachine, View::X64, key.to_owned(), Ok(record)))
            .to_vec(),
        denied: vec![],
    });
    let flags: Vec<_> = inventory
        .programs
        .iter()
        .map(|program| program.update_registration)
        .collect();
    assert_eq!(flags, [true, true, false]);
    assert_eq!(inventory.status, InventoryStatus::Complete);
}

#[test]
fn reports_source_and_record_access_failures_without_losing_good_records() {
    let inventory = collect(&FakeRegistry {
        records: vec![
            (
                Hive::CurrentUser,
                View::Shared,
                "Good".to_owned(),
                Ok(named("Good")),
            ),
            (
                Hive::CurrentUser,
                View::Shared,
                "Denied".to_owned(),
                Err(ReadError::AccessDenied),
            ),
            (
                Hive::CurrentUser,
                View::Shared,
                "Removed".to_owned(),
                Err(ReadError::ReadFailed),
            ),
        ],
        denied: vec![(Hive::LocalMachine, View::X64)],
    });
    assert_eq!(inventory.status, InventoryStatus::Partial);
    assert_eq!(inventory.programs.len(), 1);
    assert_eq!(inventory.issues.len(), 3);
    assert!(
        inventory
            .issues
            .iter()
            .any(|issue| issue.source.key.ends_with("Denied"))
    );
    let unavailable = collect(&FakeRegistry {
        records: vec![],
        denied: sources()
            .iter()
            .map(|source| (source.hive, source.view))
            .collect(),
    });
    assert_eq!(unavailable.status, InventoryStatus::Unavailable);
    let empty = collect(&FakeRegistry {
        records: vec![],
        denied: vec![],
    });
    assert_eq!(empty.status, InventoryStatus::Complete);
    assert!(empty.programs.is_empty());
}

#[test]
fn validates_calendar_dates_without_rollover() {
    assert_eq!(date("20000229").as_deref(), Some("2000-02-29"));
    for value in [
        "19000229",
        "20261301",
        "20260431",
        "20260100",
        "00000101",
        "2026-01-01",
        "abcdefgh",
        "202601011",
        "20260001",
    ] {
        assert!(date(value).is_none(), "{value}");
    }
}

#[test]
fn bounds_record_traversal_issue_collection_and_response_bytes() {
    let inventory = collect(&FakeRegistry {
        records: (0..MAX_RECORDS + 10)
            .map(|index| {
                (
                    Hive::CurrentUser,
                    View::Shared,
                    index.to_string(),
                    Err(ReadError::ReadFailed),
                )
            })
            .collect(),
        denied: vec![],
    });
    assert_eq!(inventory.status, InventoryStatus::Partial);
    assert_eq!(inventory.issues.len(), MAX_ISSUES);
    assert_eq!(
        inventory.issues_omitted as usize,
        MAX_RECORDS + 1 - MAX_ISSUES
    );
    let mut record = named(&"a".repeat(4000));
    for field in ["Publisher", "DisplayVersion", "InstallLocation"] {
        record.insert(field.to_owned(), RegistryValue::String("🧪".repeat(2000)));
    }
    let inventory = collect(&FakeRegistry {
        records: (0..MAX_RECORDS)
            .map(|index| {
                (
                    Hive::LocalMachine,
                    View::X64,
                    index.to_string(),
                    Ok(record.clone()),
                )
            })
            .collect(),
        denied: vec![],
    });
    assert_eq!(inventory.status, InventoryStatus::Partial);
    assert!(inventory.programs.len() < MAX_RECORDS);
    assert!(
        inventory
            .issues
            .iter()
            .any(|issue| issue.code == IssueCode::LimitReached)
    );
    assert!(serde_json::to_vec(&inventory).unwrap().len() < super::super::MAX_RESPONSE_BYTES);
}
