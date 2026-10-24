//! Read-only uninstall registration inventory. No command lines or filesystem scans are read.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io;

pub(super) mod icon;
#[cfg(windows)]
mod registry;

pub(super) const UNINSTALL_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
pub(super) const MAX_RECORDS: usize = 4096;
const MAX_ISSUES: usize = 64;
const MAX_INVENTORY_BYTES: usize = 6 * 1024 * 1024;
pub(super) const MAX_VALUE_BYTES: usize = 8192;
#[cfg(windows)]
pub(super) const VALUE_NAMES: [&str; 9] = [
    "DisplayName",
    "Publisher",
    "DisplayVersion",
    "EstimatedSize",
    "InstallDate",
    "InstallLocation",
    "SystemComponent",
    "ParentKeyName",
    "ReleaseType",
];
// Programs and Features lists these release types under installed updates, not programs.
const UPDATE_RELEASE_TYPES: [&str; 6] = [
    "Update",
    "Hotfix",
    "Security Update",
    "Service Pack",
    "Update Rollup",
    "Critical Update",
];

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub enum Hive {
    #[serde(rename = "HKCU")]
    CurrentUser,
    #[serde(rename = "HKLM")]
    LocalMachine,
}

impl Hive {
    /// Matches the serialized name, so source identities and JSON cannot drift apart.
    fn as_str(self) -> &'static str {
        match self {
            Self::CurrentUser => "HKCU",
            Self::LocalMachine => "HKLM",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum View {
    Shared,
    X86,
    X64,
}

impl View {
    fn as_str(self) -> &'static str {
        match self {
            Self::Shared => "shared",
            Self::X86 => "x86",
            Self::X64 => "x64",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct RegistrySource {
    pub hive: Hive,
    pub view: View,
    #[cfg_attr(feature = "schema", schemars(length(max = 1024)))]
    pub key: String,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    User,
    Machine,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Program {
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = 2048)))]
    pub id: String,
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = 4096)))]
    pub name: String,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub scope: Scope,
    #[cfg_attr(feature = "schema", schemars(range(max = 4_398_046_510_080_u64)))]
    pub reported_size_bytes: Option<u64>,
    pub reported_install_date: Option<String>,
    pub install_location: Option<String>,
    pub source: RegistrySource,
    pub system_component: bool,
    /// A child update, hotfix, or service pack registration (ParentKeyName or ReleaseType).
    pub update_registration: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IssueCode {
    AccessDenied,
    ReadFailed,
    InvalidValue,
    LimitReached,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct InventoryIssue {
    pub source: RegistrySource,
    pub code: IssueCode,
    pub message: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum InventoryStatus {
    Complete,
    Partial,
    Unavailable,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryResult {
    pub status: InventoryStatus,
    #[cfg_attr(feature = "schema", schemars(length(max = MAX_RECORDS)))]
    pub programs: Vec<Program>,
    #[cfg_attr(feature = "schema", schemars(length(max = MAX_ISSUES)))]
    pub issues: Vec<InventoryIssue>,
    pub issues_omitted: u32,
}

// Fixture inputs exercise the same normalizer as the native reader, without registry writes.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub(super) enum RegistryValue {
    String(String),
    Dword(u32),
    Invalid,
    Unreadable,
}
pub(super) type RawRecord = BTreeMap<String, RegistryValue>;

#[derive(Clone, Copy, Debug)]
pub(super) enum ReadError {
    AccessDenied,
    ReadFailed,
}

pub(super) trait RegistryReader {
    fn enumerate(
        &self,
        source: &RegistrySource,
        visit: &mut dyn FnMut(&str, Result<RawRecord, ReadError>) -> bool,
    ) -> Result<(), ReadError>;
}

pub(super) fn sources() -> [RegistrySource; 3] {
    // HKCU\Software is shared on supported Windows versions; enumerating it twice would
    // manufacture duplicate installations. HKLM\Software has distinct WOW64 views.
    [
        (Hive::CurrentUser, View::Shared),
        (Hive::LocalMachine, View::X64),
        (Hive::LocalMachine, View::X86),
    ]
    .map(|(hive, view)| RegistrySource {
        hive,
        view,
        key: UNINSTALL_KEY.to_owned(),
    })
}

fn issue(result: &mut InventoryResult, source: &RegistrySource, code: IssueCode, message: &str) {
    if result.issues.len() < MAX_ISSUES {
        result.issues.push(InventoryIssue {
            source: source.clone(),
            code,
            message: message.to_owned(),
        });
    } else {
        result.issues_omitted = result.issues_omitted.saturating_add(1);
    }
}

fn field<'a>(
    record: &'a RawRecord,
    name: &str,
    source: &RegistrySource,
    result: &mut InventoryResult,
) -> Option<&'a RegistryValue> {
    match record.get(name) {
        None => None,
        Some(RegistryValue::Unreadable) => {
            issue(
                result,
                source,
                IssueCode::ReadFailed,
                &format!("Could not read {name}."),
            );
            None
        }
        value => value,
    }
}

fn text(
    record: &RawRecord,
    name: &str,
    source: &RegistrySource,
    result: &mut InventoryResult,
) -> Option<String> {
    match field(record, name, source, result)? {
        RegistryValue::String(value) if value.chars().count() <= MAX_VALUE_BYTES / 2 => {
            let value = if name == "InstallLocation" {
                value.as_str()
            } else {
                value.trim()
            };
            if value.trim().is_empty() {
                None
            } else {
                Some(value.to_owned())
            }
        }
        _ => {
            issue(
                result,
                source,
                IssueCode::InvalidValue,
                &format!("Invalid {name}; value omitted."),
            );
            None
        }
    }
}

fn dword(
    record: &RawRecord,
    name: &str,
    source: &RegistrySource,
    result: &mut InventoryResult,
) -> Option<u32> {
    match field(record, name, source, result)? {
        RegistryValue::Dword(value) => Some(*value),
        _ => {
            issue(
                result,
                source,
                IssueCode::InvalidValue,
                &format!("Invalid {name}; value omitted."),
            );
            None
        }
    }
}

fn date(value: &str) -> Option<String> {
    if value.len() != 8 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let year: u32 = value[..4].parse().ok()?;
    let month: usize = value[4..6].parse().ok()?;
    let day: u32 = value[6..].parse().ok()?;
    let leap = year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100));
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if year == 0 || !(1..=12).contains(&month) || day == 0 || day > days[month - 1] {
        return None;
    }
    Some(format!("{}-{}-{}", &value[..4], &value[4..6], &value[6..]))
}

/// The opaque program identity. `icon::parse_program_id` reverses it.
pub(super) fn program_id(source: &RegistrySource) -> String {
    // Keep the verbatim key: Unicode lowercasing can collapse distinct Windows key names.
    // The reader enumerates each physical key once, so case folding is unnecessary.
    format!(
        "registry:{}:{}:{}",
        source.hive.as_str(),
        source.view.as_str(),
        source.key
    )
}

fn normalize(
    record: &RawRecord,
    source: RegistrySource,
    result: &mut InventoryResult,
) -> Option<Program> {
    let name = text(record, "DisplayName", &source, result)?;
    let publisher = text(record, "Publisher", &source, result);
    let version = text(record, "DisplayVersion", &source, result);
    let install_location = text(record, "InstallLocation", &source, result);
    let reported_size_bytes =
        dword(record, "EstimatedSize", &source, result).map(|size| u64::from(size) * 1024);
    let system_component = dword(record, "SystemComponent", &source, result) == Some(1);
    let parent = text(record, "ParentKeyName", &source, result);
    let release = text(record, "ReleaseType", &source, result);
    let update_registration = parent.is_some()
        || release.is_some_and(|kind| {
            UPDATE_RELEASE_TYPES
                .iter()
                .any(|update| kind.eq_ignore_ascii_case(update))
        });
    let reported_install_date = text(record, "InstallDate", &source, result).and_then(|value| {
        let parsed = date(&value);
        if parsed.is_none() {
            issue(
                result,
                &source,
                IssueCode::InvalidValue,
                "Invalid InstallDate; value omitted.",
            );
        }
        parsed
    });
    Some(Program {
        id: program_id(&source),
        name,
        publisher,
        version,
        scope: match source.hive {
            Hive::CurrentUser => Scope::User,
            Hive::LocalMachine => Scope::Machine,
        },
        reported_size_bytes,
        reported_install_date,
        install_location,
        source,
        system_component,
        update_registration,
    })
}

/// Measures serialized size without building a throwaway buffer.
struct ByteCount(usize);

impl io::Write for ByteCount {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0 += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn issue_count(result: &InventoryResult) -> usize {
    result.issues.len() + result.issues_omitted as usize
}

pub(super) fn collect(reader: &impl RegistryReader) -> InventoryResult {
    let mut result = InventoryResult {
        status: InventoryStatus::Complete,
        programs: Vec::new(),
        issues: Vec::new(),
        issues_omitted: 0,
    };
    let mut readable_sources = 0;
    let mut visited = 0;
    let mut bytes = 0;
    let mut limited = false;
    // Metadata warnings leave a registration listed; only missing registrations are partial.
    let mut incomplete = false;
    for source in sources() {
        let outcome = reader.enumerate(&source, &mut |name, record| {
            if visited >= MAX_RECORDS {
                issue(
                    &mut result,
                    &source,
                    IssueCode::LimitReached,
                    "Inventory record limit reached; list is incomplete.",
                );
                limited = true;
                return false;
            }
            visited += 1;
            let record_source = RegistrySource {
                key: format!("{}\\{name}", source.key),
                ..source.clone()
            };
            match record {
                Ok(record) => {
                    let before = issue_count(&result);
                    let Some(program) = normalize(&record, record_source, &mut result) else {
                        // A present but unusable DisplayName hides a real registration.
                        incomplete |= issue_count(&result) > before;
                        return true;
                    };
                    let mut size = ByteCount(1);
                    serde_json::to_writer(&mut size, &program).expect("program is serializable");
                    if bytes + size.0 > MAX_INVENTORY_BYTES {
                        issue(
                            &mut result,
                            &source,
                            IssueCode::LimitReached,
                            "Inventory response budget reached; list is incomplete.",
                        );
                        limited = true;
                        return false;
                    }
                    bytes += size.0;
                    result.programs.push(program);
                }
                Err(error) => {
                    incomplete = true;
                    record_error(&mut result, &record_source, error);
                }
            }
            true
        });
        match outcome {
            Ok(()) => readable_sources += 1,
            Err(error) => {
                incomplete = true;
                record_error(&mut result, &source, error);
            }
        }
        if limited {
            break;
        }
    }
    result.programs.sort_by(|a, b| a.id.cmp(&b.id));
    result.status = if readable_sources == 0 && result.programs.is_empty() {
        InventoryStatus::Unavailable
    } else if incomplete || limited {
        InventoryStatus::Partial
    } else {
        InventoryStatus::Complete
    };
    result
}

fn record_error(result: &mut InventoryResult, source: &RegistrySource, error: ReadError) {
    let (code, message) = match error {
        ReadError::AccessDenied => (
            IssueCode::AccessDenied,
            "Registry access was denied; this source is incomplete.",
        ),
        ReadError::ReadFailed => (
            IssueCode::ReadFailed,
            "Registry records could not be read; this source is incomplete.",
        ),
    };
    issue(result, source, code, message);
}

pub(super) fn list(_: super::EmptyParams) -> InventoryResult {
    #[cfg(windows)]
    {
        collect(&registry::WindowsRegistry)
    }
    #[cfg(not(windows))]
    {
        let mut result = InventoryResult {
            status: InventoryStatus::Unavailable,
            programs: vec![],
            issues: vec![],
            issues_omitted: 0,
        };
        issue(
            &mut result,
            &sources()[0],
            IssueCode::ReadFailed,
            "Windows registry inventory is only available on Windows.",
        );
        result
    }
}

#[cfg(test)]
mod tests;
