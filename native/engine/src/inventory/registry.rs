use super::{
    Hive, MAX_RECORDS, MAX_VALUE_BYTES, RawRecord, ReadError, RegistryReader, RegistrySource,
    RegistryValue, VALUE_NAMES, View,
};
use std::ptr::{null, null_mut};
use windows_sys::Win32::{
    Foundation::{
        ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS,
        ERROR_PATH_NOT_FOUND, ERROR_SUCCESS,
    },
    System::Registry::{
        HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_ENUMERATE_SUB_KEYS, KEY_QUERY_VALUE,
        KEY_WOW64_32KEY, KEY_WOW64_64KEY, REG_DWORD, REG_EXPAND_SZ, REG_SZ, RegCloseKey,
        RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW,
    },
};

pub(super) struct WindowsRegistry;
struct Key(HKEY);

impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: This handle was returned by a successful open and is owned by this Key.
        unsafe {
            RegCloseKey(self.0);
        }
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
fn read_error(code: u32) -> ReadError {
    if code == ERROR_ACCESS_DENIED {
        ReadError::AccessDenied
    } else {
        ReadError::ReadFailed
    }
}

fn open(parent: HKEY, path: &[u16], view: View, access: u32) -> Result<Option<Key>, ReadError> {
    let flags = access
        | match view {
            View::Shared => 0,
            View::X86 => KEY_WOW64_32KEY,
            View::X64 => KEY_WOW64_64KEY,
        };
    let mut handle = null_mut();
    // SAFETY: The path is NUL-terminated, parent is predefined or live, and the output is valid.
    // Callers request enumeration or value-query permissions, never registry write access.
    let code = unsafe { RegOpenKeyExW(parent, path.as_ptr(), 0, flags, &mut handle) };
    match code {
        ERROR_SUCCESS => Ok(Some(Key(handle))),
        ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => Ok(None),
        _ => Err(read_error(code)),
    }
}

fn decode(kind: u32, bytes: &[u8]) -> RegistryValue {
    match kind {
        REG_DWORD if bytes.len() == 4 => {
            RegistryValue::Dword(u32::from_le_bytes(bytes.try_into().expect("four bytes")))
        }
        REG_SZ | REG_EXPAND_SZ => {
            // Like Windows itself, end the string at its first NUL. Installers commonly store
            // extra terminators or an odd trailing byte, which must not discard the value.
            let units: Vec<u16> = bytes
                .as_chunks::<2>()
                .0
                .iter()
                .map(|pair| u16::from_le_bytes(*pair))
                .take_while(|unit| *unit != 0)
                .collect();
            // Unexpanded REG_EXPAND_SZ is intentionally shown as reported. No environment,
            // network paths, shell commands, or installation directories are resolved.
            String::from_utf16(&units).map_or(RegistryValue::Invalid, RegistryValue::String)
        }
        _ => RegistryValue::Invalid,
    }
}

fn record(key: &Key, names: &[(&str, Vec<u16>)]) -> RawRecord {
    let mut record = RawRecord::new();
    for (name, wide_name) in names {
        let mut buffer = [0u8; MAX_VALUE_BYTES];
        let mut size = buffer.len() as u32;
        let mut kind = 0;
        // SAFETY: The live key, NUL-terminated value name, fixed buffer, and length/type
        // outputs remain valid for the call. Oversized values are rejected without allocation.
        let code = unsafe {
            RegQueryValueExW(
                key.0,
                wide_name.as_ptr(),
                null(),
                &mut kind,
                buffer.as_mut_ptr(),
                &mut size,
            )
        };
        let value = match code {
            ERROR_FILE_NOT_FOUND => continue,
            ERROR_SUCCESS if size as usize <= buffer.len() => {
                decode(kind, &buffer[..size as usize])
            }
            // ERROR_MORE_DATA and malformed values are surfaced as omitted metadata.
            ERROR_MORE_DATA => RegistryValue::Invalid,
            _ => RegistryValue::Unreadable,
        };
        record.insert((*name).to_owned(), value);
    }
    record
}

impl RegistryReader for WindowsRegistry {
    fn enumerate(
        &self,
        source: &RegistrySource,
        visit: &mut dyn FnMut(&str, Result<RawRecord, ReadError>) -> bool,
    ) -> Result<(), ReadError> {
        let hive = match source.hive {
            Hive::CurrentUser => HKEY_CURRENT_USER,
            Hive::LocalMachine => HKEY_LOCAL_MACHINE,
        };
        let Some(root) = open(
            hive,
            &wide(&source.key),
            source.view,
            KEY_ENUMERATE_SUB_KEYS,
        )?
        else {
            return Ok(());
        };
        let names = VALUE_NAMES.map(|name| (name, wide(name)));
        // One extra entry lets the collector report a bounded incomplete result.
        for index in 0..=MAX_RECORDS as u32 {
            let mut buffer = [0u16; 256];
            let mut length = buffer.len() as u32;
            // SAFETY: All output buffers/lengths are valid, and optional outputs are null.
            let code = unsafe {
                RegEnumKeyExW(
                    root.0,
                    index,
                    buffer.as_mut_ptr(),
                    &mut length,
                    null(),
                    null_mut(),
                    null_mut(),
                    null_mut(),
                )
            };
            match code {
                ERROR_NO_MORE_ITEMS => return Ok(()),
                ERROR_SUCCESS => {}
                _ => return Err(read_error(code)),
            }
            let units = &buffer[..length as usize];
            // An undecodable key name affects only its own registration; keep enumerating.
            let (name, entry) = match String::from_utf16(units) {
                Ok(name) => {
                    let entry = match open(root.0, &wide(&name), source.view, KEY_QUERY_VALUE) {
                        Ok(Some(key)) => Ok(record(&key, &names)),
                        // Registration disappeared during discovery.
                        Ok(None) => Err(ReadError::ReadFailed),
                        Err(error) => Err(error),
                    };
                    (name, entry)
                }
                Err(_) => (String::from_utf16_lossy(units), Err(ReadError::ReadFailed)),
            };
            if !visit(&name, entry) {
                break;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_strict_registry_types_and_unicode_without_expanding_paths() {
        let encoded: Vec<u8> = wide(r"%LOCALAPPDATA%\工具 🧪")
            .iter()
            .flat_map(|unit| unit.to_le_bytes())
            .collect();
        assert!(
            matches!(decode(REG_EXPAND_SZ, &encoded), RegistryValue::String(value) if value == r"%LOCALAPPDATA%\工具 🧪")
        );
        assert!(matches!(
            decode(REG_DWORD, &42u32.to_le_bytes()),
            RegistryValue::Dword(42)
        ));
        // Extra terminators, data after the first NUL, and an odd trailing byte are ignored.
        for data in [
            vec![65, 0, 0, 0, 0, 0],
            vec![65, 0, 0, 0, 66, 0],
            vec![65, 0, 0],
            vec![65, 0],
        ] {
            assert!(
                matches!(decode(REG_SZ, &data), RegistryValue::String(value) if value == "A"),
                "{data:?}"
            );
        }
        for (kind, data) in [(REG_SZ, vec![0, 216]), (REG_DWORD, vec![1]), (7, vec![])] {
            assert!(matches!(decode(kind, &data), RegistryValue::Invalid));
        }
    }
}
