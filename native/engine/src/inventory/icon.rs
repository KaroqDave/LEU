//! Program icons, read lazily for one registration at a time. The caller names a program by its
//! inventory id, never by a path; the engine re-reads that registration's `DisplayIcon`, or a
//! Windows Installer product's registered icon, and accepts only a local executable, library, or
//! icon file. No installation directory is searched.
use super::{Hive, RawRecord, ReadError, RegistrySource, RegistryValue, UNINSTALL_KEY, View};
use serde::{Deserialize, Serialize};

/// Width and height of every returned icon. Covers the details panel at high display scaling.
pub(super) const ICON_SIZE: u32 = 64;
const MAX_PROGRAM_ID_CHARS: usize = 2048;
// Registry key names are limited to 255 UTF-16 units.
const MAX_KEY_NAME_UNITS: usize = 255;
const EXTENSIONS: [&str; 3] = ["exe", "dll", "ico"];

// The PNG is stored without compression, so its size is fixed by `ICON_SIZE`.
const PNG_DATA_BYTES: usize = (ICON_SIZE as usize * 4 + 1) * ICON_SIZE as usize;
const PNG_BYTES: usize =
    8 + 25 + 12 + 2 + PNG_DATA_BYTES.div_ceil(65_535) * 5 + PNG_DATA_BYTES + 4 + 12;
const PNG_BASE64_CHARS: usize = PNG_BYTES.div_ceil(3) * 4;

#[derive(Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IconParams {
    #[cfg_attr(
        feature = "schema",
        schemars(length(min = 1, max = MAX_PROGRAM_ID_CHARS))
    )]
    pub program_id: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(tag = "status", rename_all = "lowercase", deny_unknown_fields)]
pub enum IconResult {
    Found {
        /// A base64 PNG of 64 by 64 pixels, encoded by the engine rather than copied from disk.
        #[cfg_attr(
            feature = "schema",
            schemars(
                length(min = PNG_BASE64_CHARS, max = PNG_BASE64_CHARS),
                pattern(r"^[A-Za-z0-9+/]+={0,2}$")
            )
        )]
        png: String,
    },
    Missing {
        reason: IconMissing,
    },
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IconMissing {
    /// Not an id this inventory produces, or the registration no longer exists.
    UnknownProgram,
    /// The registration has no usable `DisplayIcon` value.
    NoIcon,
    /// `DisplayIcon` names something LEU does not open, such as a network path or a script.
    UnsupportedLocation,
    /// The registry value or icon file could not be read.
    ReadFailed,
}

/// Straight-alpha RGBA pixels of an `ICON_SIZE` square, top row first.
pub(super) struct Rgba(pub Vec<u8>);

pub(super) trait IconHost {
    fn read(&self, source: &RegistrySource, names: &[&str])
    -> Result<Option<RawRecord>, ReadError>;
    /// The `ProductIcon` Windows Installer registered for a product code, if any.
    fn product_icon(&self, product_code: &str) -> Option<String>;
    /// Expands environment references in a `REG_EXPAND_SZ`-style path.
    fn expand(&self, path: &str) -> Option<String>;
    /// Extracts an icon from a path that already passed the location checks.
    fn extract(&self, path: &str, index: i32) -> Result<Rgba, IconMissing>;
}

/// Reverses `super::program_id` for the registry sources the inventory reads.
pub(super) fn parse_program_id(id: &str) -> Option<RegistrySource> {
    let (hive, rest) = id.strip_prefix("registry:")?.split_once(':')?;
    let (view, key) = rest.split_once(':')?;
    let (hive, view) = match (hive, view) {
        ("HKCU", "shared") => (Hive::CurrentUser, View::Shared),
        ("HKLM", "x64") => (Hive::LocalMachine, View::X64),
        ("HKLM", "x86") => (Hive::LocalMachine, View::X86),
        _ => return None,
    };
    let name = key.strip_prefix(UNINSTALL_KEY)?.strip_prefix('\\')?;
    let units = name.encode_utf16().count();
    if units == 0 || units > MAX_KEY_NAME_UNITS || name.contains(['\\', '\0']) {
        return None;
    }
    Some(RegistrySource {
        hive,
        view,
        key: key.to_owned(),
    })
}

/// Splits `DisplayIcon` into a path and icon index. Windows accepts `path`, `path,index`, and
/// either form quoted; a negative index names a resource id. Paths cannot contain quotes.
pub(super) fn parse_display_icon(value: &str) -> Option<(String, i32)> {
    let unquoted: String = value
        .chars()
        .filter(|character| *character != '"')
        .collect();
    let value = unquoted.trim();
    let (path, index) = value
        .rsplit_once(',')
        .and_then(|(path, index)| Some((path.trim(), index.trim().parse().ok()?)))
        .unwrap_or((value, 0));
    (!path.is_empty()).then(|| (path.to_owned(), index))
}

/// Accepts an absolute drive path. This rejects UNC and device paths, relative paths searched by
/// Windows, and alternate data streams.
fn is_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() > 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
        && !path[2..].contains(':')
        && !path.chars().any(char::is_control)
}

/// Accepts only an absolute drive path to an executable, library, or icon file.
pub(super) fn is_supported_location(path: &str) -> bool {
    let extension = path
        .rsplit(['\\', '/'])
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, extension)| extension.to_ascii_lowercase());
    is_drive_path(path)
        && extension.is_some_and(|extension| EXTENSIONS.contains(&extension.as_str()))
}

/// Windows Installer caches product icons as `...\Installer\{ProductCode}\<Icon table name>`,
/// and those names often have no extension. Accept such a file only in that product's folder.
pub(super) fn is_cached_installer_icon(path: &str, product_code: &str) -> bool {
    let mut components = path.rsplit(['\\', '/']);
    let (Some(name), Some(product), Some(cache)) =
        (components.next(), components.next(), components.next())
    else {
        return false;
    };
    is_drive_path(path)
        && !name.is_empty()
        && !name.contains('.')
        && product.eq_ignore_ascii_case(product_code)
        && cache.eq_ignore_ascii_case("Installer")
}

/// The product code of a Windows Installer registration, whose uninstall key is named by it.
pub(super) fn installer_product_code<'a>(
    source: &'a RegistrySource,
    record: &RawRecord,
) -> Option<&'a str> {
    let name = source.key.rsplit('\\').next()?;
    let bytes = name.as_bytes();
    let guid = bytes.len() == 38
        && bytes[0] == b'{'
        && bytes[37] == b'}'
        && bytes[1..37].iter().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                *byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        });
    (guid
        && matches!(
            record.get("WindowsInstaller"),
            Some(RegistryValue::Dword(1))
        ))
    .then_some(name)
}

pub(super) fn lookup(host: &impl IconHost, program_id: &str) -> IconResult {
    let missing = |reason| IconResult::Missing { reason };
    let Some(source) = (program_id.chars().count() <= MAX_PROGRAM_ID_CHARS)
        .then(|| parse_program_id(program_id))
        .flatten()
    else {
        return missing(IconMissing::UnknownProgram);
    };
    let record = match host.read(&source, &["DisplayIcon", "WindowsInstaller"]) {
        Ok(Some(record)) => record,
        Ok(None) => return missing(IconMissing::UnknownProgram),
        Err(_) => return missing(IconMissing::ReadFailed),
    };
    let display_icon = match record.get("DisplayIcon") {
        Some(RegistryValue::String(value)) => parse_display_icon(value),
        None => None,
        Some(_) => return missing(IconMissing::ReadFailed),
    };
    // Like Windows Settings, fall back to the icon Windows Installer registered for the product
    // (ARPPRODUCTICON) when the uninstall registration has no DisplayIcon.
    let (path, index, product_code) = match display_icon {
        Some((path, index)) => (path, index, None),
        None => {
            let Some(product_code) = installer_product_code(&source, &record) else {
                return missing(IconMissing::NoIcon);
            };
            let Some((path, index)) = host
                .product_icon(product_code)
                .as_deref()
                .and_then(parse_display_icon)
            else {
                return missing(IconMissing::NoIcon);
            };
            (path, index, Some(product_code))
        }
    };
    let Some(path) = host.expand(&path) else {
        return missing(IconMissing::UnsupportedLocation);
    };
    let supported = is_supported_location(&path)
        || product_code.is_some_and(|product_code| is_cached_installer_icon(&path, product_code));
    if !supported {
        return missing(IconMissing::UnsupportedLocation);
    }
    match host.extract(&path, index) {
        Ok(Rgba(pixels)) if pixels.len() == (ICON_SIZE * ICON_SIZE * 4) as usize => {
            let png = base64(&png(ICON_SIZE, &pixels));
            debug_assert_eq!(png.len(), PNG_BASE64_CHARS);
            IconResult::Found { png }
        }
        Ok(_) => missing(IconMissing::ReadFailed),
        Err(reason) => missing(reason),
    }
}

pub(crate) fn icon(params: IconParams) -> IconResult {
    #[cfg(windows)]
    {
        lookup(&shell::WindowsIcons, &params.program_id)
    }
    #[cfg(not(windows))]
    {
        let _ = params;
        IconResult::Missing {
            reason: IconMissing::ReadFailed,
        }
    }
}

/// Encodes RGBA pixels as an uncompressed PNG. Re-encoding means the interface only decodes
/// images produced here, never bytes taken from an installer's file.
fn png(size: u32, rgba: &[u8]) -> Vec<u8> {
    let row = size as usize * 4;
    let mut data = Vec::with_capacity((row + 1) * size as usize);
    for line in rgba.chunks_exact(row) {
        data.push(0); // No row filter.
        data.extend_from_slice(line);
    }
    // A zlib stream of stored deflate blocks, each at most 65,535 bytes.
    let mut zlib = vec![0x78, 0x01];
    let mut blocks = data.chunks(65_535).peekable();
    while let Some(block) = blocks.next() {
        let length = block.len() as u16;
        zlib.push(u8::from(blocks.peek().is_none()));
        zlib.extend_from_slice(&length.to_le_bytes());
        zlib.extend_from_slice(&(!length).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    zlib.extend_from_slice(&adler32(&data).to_be_bytes());

    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&size.to_be_bytes());
    header.extend_from_slice(&size.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]); // 8-bit RGBA, no interlacing.
    let mut output = b"\x89PNG\r\n\x1a\n".to_vec();
    for (kind, chunk) in [(b"IHDR", &header[..]), (b"IDAT", &zlib), (b"IEND", &[])] {
        output.extend_from_slice(&(chunk.len() as u32).to_be_bytes());
        let start = output.len();
        output.extend_from_slice(kind);
        output.extend_from_slice(chunk);
        let crc = crc32(&output[start..]);
        output.extend_from_slice(&crc.to_be_bytes());
    }
    output
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = !0u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn adler32(bytes: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for byte in bytes {
        a = (a + u32::from(*byte)) % 65_521;
        b = (b + a) % 65_521;
    }
    (b << 16) | a
}

fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let triple = chunk
            .iter()
            .enumerate()
            .fold(0u32, |triple, (index, byte)| {
                triple | u32::from(*byte) << (16 - 8 * index)
            });
        for index in 0..4 {
            output.push(if index <= chunk.len() {
                char::from(ALPHABET[(triple >> (18 - 6 * index)) as usize & 63])
            } else {
                '='
            });
        }
    }
    output
}

#[cfg(windows)]
mod shell;

#[cfg(test)]
mod tests;
