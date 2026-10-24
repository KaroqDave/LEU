use super::*;
use crate::inventory::{program_id, sources};
use std::cell::RefCell;
use std::collections::BTreeMap;

struct FakeHost {
    record: Result<Option<RawRecord>, ReadError>,
    extracted: RefCell<Vec<(String, i32)>>,
}

impl FakeHost {
    fn with(record: Result<Option<RawRecord>, ReadError>) -> Self {
        Self {
            record,
            extracted: RefCell::new(vec![]),
        }
    }

    fn display_icon(value: RegistryValue) -> Self {
        Self::with(Ok(Some(BTreeMap::from([(
            "DisplayIcon".to_owned(),
            value,
        )]))))
    }
}

impl IconHost for FakeHost {
    fn read(&self, _: &RegistrySource, names: &[&str]) -> Result<Option<RawRecord>, ReadError> {
        assert_eq!(names, ["DisplayIcon"]);
        self.record.clone()
    }

    fn expand(&self, path: &str) -> Option<String> {
        Some(path.replace("%ProgramFiles%", r"C:\Program Files"))
    }

    fn extract(&self, path: &str, index: i32) -> Result<Rgba, IconMissing> {
        self.extracted.borrow_mut().push((path.to_owned(), index));
        Ok(Rgba(vec![200; (ICON_SIZE * ICON_SIZE * 4) as usize]))
    }
}

fn id(name: &str) -> String {
    format!(r"registry:HKLM:x64:{UNINSTALL_KEY}\{name}")
}

#[test]
fn program_ids_round_trip_for_every_inventory_source() {
    for source in sources() {
        for name in [
            "{0F2A-GUID}",
            "Tool 工具 🧪",
            "name:with:colons",
            &"x".repeat(255),
        ] {
            let source = RegistrySource {
                key: format!(r"{UNINSTALL_KEY}\{name}"),
                ..source.clone()
            };
            let parsed = parse_program_id(&program_id(&source)).expect(name);
            assert_eq!(
                (parsed.hive, parsed.view, parsed.key),
                (source.hive, source.view, source.key)
            );
        }
    }
}

#[test]
fn rejects_ids_outside_the_uninstall_registrations() {
    for value in [
        String::new(),
        "demo-code".to_owned(),
        format!(r"registry:HKCU:x64:{UNINSTALL_KEY}\App"),
        format!(r"registry:HKLM:shared:{UNINSTALL_KEY}\App"),
        format!(r"registry:HKCR:x64:{UNINSTALL_KEY}\App"),
        format!(r"registry:HKLM:x64:{UNINSTALL_KEY}"),
        format!(r"registry:HKLM:x64:{UNINSTALL_KEY}\"),
        format!(r"registry:HKLM:x64:{UNINSTALL_KEY}\App\Nested"),
        format!(r"registry:HKLM:x64:{UNINSTALL_KEY}Sibling\App"),
        format!("registry:HKLM:x64:{UNINSTALL_KEY}\\App\0"),
        r"registry:HKLM:x64:SOFTWARE\Policies\App".to_owned(),
        r"registry:HKLM:x64:software\microsoft\windows\currentversion\uninstall\App".to_owned(),
        id(&"x".repeat(256)),
    ] {
        assert!(parse_program_id(&value).is_none(), "{value}");
        assert_eq!(
            lookup(&FakeHost::with(Ok(None)), &value),
            IconResult::Missing {
                reason: IconMissing::UnknownProgram
            }
        );
    }
}

#[test]
fn parses_display_icon_forms() {
    for (value, expected) in [
        (r"C:\App\app.exe", (r"C:\App\app.exe", 0)),
        (r"C:\App\app.exe,2", (r"C:\App\app.exe", 2)),
        (r"C:\App\app.exe, -101", (r"C:\App\app.exe", -101)),
        (r#""C:\App Dir\app.exe",1"#, (r"C:\App Dir\app.exe", 1)),
        (r#""C:\App Dir\app.exe,1""#, (r"C:\App Dir\app.exe", 1)),
        (r#"  "C:\App\app.ico"  "#, (r"C:\App\app.ico", 0)),
        (r"C:\Vendor, Inc\app.exe", (r"C:\Vendor, Inc\app.exe", 0)),
        (r"C:\App\app.exe,x", (r"C:\App\app.exe,x", 0)),
    ] {
        assert_eq!(
            parse_display_icon(value),
            Some((expected.0.to_owned(), expected.1)),
            "{value}"
        );
    }
    for value in ["", "   ", r#""""#, ",0", r#""",3"#] {
        assert_eq!(parse_display_icon(value), None, "{value}");
    }
}

#[test]
fn opens_only_local_executables_libraries_and_icons() {
    for path in [
        r"C:\Program Files\App\app.exe",
        r"d:\Tools\LIB.DLL",
        r"C:/Users/Demo/AppData/Local/App/icon.ico",
        r"C:\Vendor, Inc\工具 🧪.exe",
    ] {
        assert!(is_supported_location(path), "{path}");
    }
    for path in [
        r"\\server\share\app.exe",
        r"\\?\C:\App\app.exe",
        r"\\.\pipe\app.exe",
        r"app.exe",
        r"\App\app.exe",
        r"C:app.exe",
        r"C:\App\app.exe:stream",
        r"C:\App\app.exe:stream.exe",
        r"C:\App\app.cmd",
        r"C:\App\app.lnk",
        r"C:\App\app.ps1",
        r"C:\App\exe",
        r"C:\App.exe\folder",
        "C:\\App\\app\n.exe",
        r"C:\",
        "",
    ] {
        assert!(!is_supported_location(path), "{path}");
    }
}

#[test]
fn reports_why_an_icon_is_missing() {
    let cases = [
        (FakeHost::with(Ok(None)), IconMissing::UnknownProgram),
        (
            FakeHost::with(Err(ReadError::AccessDenied)),
            IconMissing::ReadFailed,
        ),
        (
            FakeHost::with(Ok(Some(BTreeMap::new()))),
            IconMissing::NoIcon,
        ),
        (
            FakeHost::display_icon(RegistryValue::String("  ".to_owned())),
            IconMissing::NoIcon,
        ),
        (
            FakeHost::display_icon(RegistryValue::Invalid),
            IconMissing::ReadFailed,
        ),
        (
            FakeHost::display_icon(RegistryValue::Unreadable),
            IconMissing::ReadFailed,
        ),
        (
            FakeHost::display_icon(RegistryValue::String(r"\\server\share\app.exe".to_owned())),
            IconMissing::UnsupportedLocation,
        ),
        (
            FakeHost::display_icon(RegistryValue::String(r"C:\App\setup.bat".to_owned())),
            IconMissing::UnsupportedLocation,
        ),
    ];
    for (host, reason) in cases {
        assert_eq!(lookup(&host, &id("App")), IconResult::Missing { reason });
        assert!(host.extracted.borrow().is_empty());
    }
}

#[test]
fn expands_and_extracts_the_registered_icon() {
    let host = FakeHost::display_icon(RegistryValue::String(
        r#""%ProgramFiles%\App\app.exe",-3"#.to_owned(),
    ));
    let IconResult::Found { png } = lookup(&host, &id("App")) else {
        panic!("expected an icon");
    };
    assert_eq!(png.len(), PNG_BASE64_CHARS);
    assert!(png.starts_with("iVBORw0KGgo"));
    assert_eq!(
        *host.extracted.borrow(),
        [(r"C:\Program Files\App\app.exe".to_owned(), -3)]
    );
}

#[test]
fn encodes_base64() {
    for (input, output) in [
        (&b""[..], ""),
        (b"M", "TQ=="),
        (b"Ma", "TWE="),
        (b"Man", "TWFu"),
        (&[0xfb, 0xff, 0xbf], "+/+/"),
    ] {
        assert_eq!(base64(input), output);
    }
}

#[test]
fn encodes_a_valid_uncompressed_png() {
    let pixels: Vec<u8> = (0..ICON_SIZE * ICON_SIZE * 4)
        .map(|value| value as u8)
        .collect();
    let encoded = png(ICON_SIZE, &pixels);
    assert_eq!(encoded.len(), PNG_BYTES);
    assert_eq!(&encoded[..8], b"\x89PNG\r\n\x1a\n");

    let mut offset = 8;
    let mut chunks = vec![];
    while offset < encoded.len() {
        let length = u32::from_be_bytes(encoded[offset..offset + 4].try_into().unwrap()) as usize;
        let body = &encoded[offset + 4..offset + 8 + length];
        let crc = u32::from_be_bytes(encoded[offset + 8 + length..][..4].try_into().unwrap());
        assert_eq!(crc32(body), crc);
        chunks.push((body[..4].to_vec(), body[4..].to_vec()));
        offset += 12 + length;
    }
    let kinds: Vec<_> = chunks.iter().map(|(kind, _)| kind.as_slice()).collect();
    assert_eq!(kinds, [b"IHDR", b"IDAT", b"IEND"]);
    assert_eq!(chunks[0].1[..8], [0, 0, 0, 64, 0, 0, 0, 64]);
    assert_eq!(chunks[0].1[8..], [8, 6, 0, 0, 0]);

    // Inflate the stored blocks and compare every filtered row with the input.
    let zlib = &chunks[1].1;
    assert_eq!((u16::from(zlib[0]) << 8 | u16::from(zlib[1])) % 31, 0);
    let mut data = vec![];
    let mut position = 2;
    loop {
        let last = zlib[position] == 1;
        let length = u16::from_le_bytes([zlib[position + 1], zlib[position + 2]]);
        let check = u16::from_le_bytes([zlib[position + 3], zlib[position + 4]]);
        assert_eq!(length, !check);
        data.extend_from_slice(&zlib[position + 5..position + 5 + length as usize]);
        position += 5 + length as usize;
        if last {
            break;
        }
    }
    assert_eq!(&zlib[position..], adler32(&data).to_be_bytes());
    let row = ICON_SIZE as usize * 4;
    for (line, expected) in data.chunks_exact(row + 1).zip(pixels.chunks_exact(row)) {
        assert_eq!(line[0], 0);
        assert_eq!(&line[1..], expected);
    }
    assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    assert_eq!(adler32(b"Wikipedia"), 0x11E6_0398);
}

#[cfg(windows)]
#[test]
fn extracts_a_windows_icon_without_registry_access() {
    use super::shell::WindowsIcons;
    let path = WindowsIcons
        .expand(r"%SystemRoot%\System32\shell32.dll")
        .unwrap();
    assert!(is_supported_location(&path));
    let Rgba(pixels) = WindowsIcons.extract(&path, 0).expect("shell32 has icons");
    assert_eq!(pixels.len(), (ICON_SIZE * ICON_SIZE * 4) as usize);
    assert!(
        pixels
            .as_chunks::<4>()
            .0
            .iter()
            .any(|pixel| pixel[3] == 255)
    );
    assert!(pixels.as_chunks::<4>().0.iter().any(|pixel| pixel[3] == 0));
    assert!(matches!(
        WindowsIcons.extract(&path.replace("shell32.dll", "leu-missing.dll"), 0),
        Err(IconMissing::ReadFailed)
    ));
    assert!(matches!(
        WindowsIcons.extract(&path, 99_999),
        Err(IconMissing::ReadFailed)
    ));
    assert!(WindowsIcons.expand("%LEU_UNDEFINED%\\x.exe").is_some());
}
