use super::{ICON_SIZE, IconHost, IconMissing, Rgba};
use crate::inventory::registry::{WindowsRegistry, wide};
use crate::inventory::{MAX_VALUE_BYTES, RawRecord, ReadError, RegistrySource};
use std::mem::size_of;
use std::ptr::null_mut;
use windows_sys::Win32::{
    Foundation::ERROR_SUCCESS,
    Graphics::Gdi::{
        BI_RGB, BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC,
        DeleteObject, GetDIBits, GetObjectW, HBITMAP, HDC,
    },
    Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_OFFLINE, FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS,
        FILE_ATTRIBUTE_RECALL_ON_OPEN, FILE_ATTRIBUTE_REPARSE_POINT, GetDriveTypeW,
        GetFileAttributesW, INVALID_FILE_ATTRIBUTES,
    },
    System::{
        ApplicationInstallationAndServicing::{INSTALLPROPERTY_PRODUCTICON, MsiGetProductInfoW},
        Environment::ExpandEnvironmentStringsW,
    },
    UI::{
        Shell::SHDefExtractIconW,
        WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
    },
};

// From WinBase.h; windows-sys places it behind an unrelated feature.
const DRIVE_FIXED: u32 = 3;
// Longest path Windows accepts, including the terminating NUL.
const MAX_EXPANDED_UNITS: usize = 32_768;
// Network, cloud-placeholder, and redirected files could leave the machine or download data.
const SKIPPED_ATTRIBUTES: u32 = FILE_ATTRIBUTE_DIRECTORY
    | FILE_ATTRIBUTE_REPARSE_POINT
    | FILE_ATTRIBUTE_OFFLINE
    | FILE_ATTRIBUTE_RECALL_ON_OPEN
    | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;

pub(super) struct WindowsIcons;

struct Icon(HICON);
impl Drop for Icon {
    fn drop(&mut self) {
        // SAFETY: The icon was returned by SHDefExtractIconW and is owned by this value.
        unsafe {
            DestroyIcon(self.0);
        }
    }
}

struct Bitmap(HBITMAP);
impl Drop for Bitmap {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: GetIconInfo created this bitmap for the caller, which must delete it.
            unsafe {
                DeleteObject(self.0);
            }
        }
    }
}

struct Dc(HDC);
impl Drop for Dc {
    fn drop(&mut self) {
        // SAFETY: The memory DC was created by CreateCompatibleDC and is owned by this value.
        unsafe {
            DeleteDC(self.0);
        }
    }
}

impl IconHost for WindowsIcons {
    fn read(
        &self,
        source: &RegistrySource,
        names: &[&str],
    ) -> Result<Option<RawRecord>, ReadError> {
        WindowsRegistry.read(source, names)
    }

    fn product_icon(&self, product_code: &str) -> Option<String> {
        let product_code = wide(product_code);
        // The same bound as registry strings read by the inventory.
        let mut buffer = vec![0u16; MAX_VALUE_BYTES / 2];
        let mut length = buffer.len() as u32;
        // SAFETY: The product code is NUL-terminated, the property is a static wide string, and
        // the length is the buffer's capacity in characters. This reads the product
        // registration; unlike Win32_Product queries, it does not verify or repair the product.
        let result = unsafe {
            MsiGetProductInfoW(
                product_code.as_ptr(),
                INSTALLPROPERTY_PRODUCTICON,
                buffer.as_mut_ptr(),
                &mut length,
            )
        };
        // Unknown products, missing properties, and oversized values all leave no icon.
        if result != ERROR_SUCCESS || length as usize >= buffer.len() {
            return None;
        }
        String::from_utf16(&buffer[..length as usize]).ok()
    }

    fn expand(&self, path: &str) -> Option<String> {
        let source = wide(path);
        let mut buffer = vec![0u16; MAX_EXPANDED_UNITS];
        // SAFETY: The source is NUL-terminated and the output length matches the buffer.
        let length = unsafe {
            ExpandEnvironmentStringsW(source.as_ptr(), buffer.as_mut_ptr(), buffer.len() as u32)
        } as usize;
        // The returned length includes the NUL; zero is a failure, and larger means truncated.
        if length == 0 || length > buffer.len() {
            return None;
        }
        String::from_utf16(&buffer[..length - 1]).ok()
    }

    fn extract(&self, path: &str, index: i32) -> Result<Rgba, IconMissing> {
        let drive = wide(&format!("{}:\\", &path[..1]));
        // SAFETY: The root path is NUL-terminated. This only queries the drive type.
        if unsafe { GetDriveTypeW(drive.as_ptr()) } != DRIVE_FIXED {
            return Err(IconMissing::UnsupportedLocation);
        }
        let path = wide(path);
        // SAFETY: The path is NUL-terminated. This reads attributes without opening the file.
        let attributes = unsafe { GetFileAttributesW(path.as_ptr()) };
        if attributes == INVALID_FILE_ATTRIBUTES {
            return Err(IconMissing::ReadFailed);
        }
        if attributes & SKIPPED_ATTRIBUTES != 0 {
            return Err(IconMissing::UnsupportedLocation);
        }
        let mut handle = null_mut();
        // SAFETY: The path is NUL-terminated and the large-icon output is valid; the small icon
        // is not requested. The default extractor reads icon resources without running code
        // from the file and does not load shell extension icon handlers.
        let result = unsafe {
            SHDefExtractIconW(path.as_ptr(), index, 0, &mut handle, null_mut(), ICON_SIZE)
        };
        // S_FALSE (1) means the file has no icon at that index.
        if result != 0 || handle.is_null() {
            return Err(IconMissing::ReadFailed);
        }
        pixels(&Icon(handle)).ok_or(IconMissing::ReadFailed)
    }
}

fn pixels(icon: &Icon) -> Option<Rgba> {
    let mut info = ICONINFO::default();
    // SAFETY: The icon is live and the output structure is valid.
    if unsafe { GetIconInfo(icon.0, &mut info) } == 0 {
        return None;
    }
    let mask = Bitmap(info.hbmMask);
    let color = Bitmap(info.hbmColor);
    // Monochrome icons have no color bitmap; they are rare enough to leave as placeholders.
    if color.0.is_null() || mask.0.is_null() {
        return None;
    }
    let mut bitmap = BITMAP::default();
    // SAFETY: The bitmap is live and the output buffer has the size passed.
    let read = unsafe {
        GetObjectW(
            color.0,
            size_of::<BITMAP>() as i32,
            (&raw mut bitmap).cast(),
        )
    };
    let size = ICON_SIZE as i32;
    if read == 0 || bitmap.bmWidth != size || bitmap.bmHeight != size {
        return None;
    }
    // SAFETY: A null DC requests a memory DC compatible with the screen.
    let dc = Dc(unsafe { CreateCompatibleDC(null_mut()) });
    if dc.0.is_null() {
        return None;
    }
    let mut pixels = bits(&dc, &color)?;
    // Icons without an alpha channel mark transparency in the mask instead.
    if pixels.as_chunks::<4>().0.iter().all(|pixel| pixel[3] == 0) {
        let mask = bits(&dc, &mask)?;
        for (pixel, mask) in pixels
            .as_chunks_mut::<4>()
            .0
            .iter_mut()
            .zip(mask.as_chunks::<4>().0)
        {
            pixel[3] = if mask[0] == 0 { 255 } else { 0 };
        }
    }
    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2); // BGRA to RGBA.
    }
    Some(Rgba(pixels))
}

/// Reads a bitmap as 32-bit, top-down BGRA rows of `ICON_SIZE` pixels.
fn bits(dc: &Dc, bitmap: &Bitmap) -> Option<Vec<u8>> {
    let size = ICON_SIZE as i32;
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size,
            biHeight: -size,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (ICON_SIZE * ICON_SIZE * 4) as usize];
    // SAFETY: The DC and bitmap are live, the bitmap is not selected into a DC, and the
    // buffer holds every requested 32-bit row.
    let lines = unsafe {
        GetDIBits(
            dc.0,
            bitmap.0,
            0,
            ICON_SIZE,
            pixels.as_mut_ptr().cast(),
            &mut info,
            DIB_RGB_COLORS,
        )
    };
    (lines == size).then_some(pixels)
}
