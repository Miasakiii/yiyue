use crate::models::{ComicChapter, ComicMetadata, ComicPage};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"];

fn is_image(name: &str) -> bool {
    let lower = name.to_lowercase();
    IMAGE_EXTENSIONS.iter().any(|ext| lower.ends_with(&format!(".{}", ext)))
}

fn natural_sort_key(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_digit = false;

    for c in s.chars() {
        if c.is_ascii_digit() != in_digit {
            if !current.is_empty() {
                parts.push(current.clone());
                current.clear();
            }
            in_digit = c.is_ascii_digit();
        }
        current.push(c);
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

pub struct ParsedComic {
    pub metadata: ComicMetadata,
    pub chapters: Vec<ComicChapter>,
    pub cover_path: Option<String>,
}

/// Parse a CBZ file. Extracts images to cache directory.
pub fn parse_cbz(cbz_path: &Path, cache_dir: &Path) -> Result<ParsedComic, String> {
    let file = fs::File::open(cbz_path).map_err(|e| format!("Failed to open CBZ: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read ZIP: {}", e))?;

    let book_hash = {
        let data = fs::read(cbz_path).map_err(|e| e.to_string())?;
        blake3::hash(&data).to_hex().to_string()
    };

    let book_cache_dir = cache_dir.join(&book_hash[..2]).join(&book_hash);
    fs::create_dir_all(&book_cache_dir).map_err(|e| e.to_string())?;

    // Collect image entries
    let mut image_entries: Vec<(String, usize)> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if is_image(&name) && !name.starts_with("__MACOSX") {
            image_entries.push((name, i));
        }
    }

    // Natural sort by filename
    image_entries.sort_by(|a, b| {
        let ka = natural_sort_key(&a.0);
        let kb = natural_sort_key(&b.0);
        ka.cmp(&kb)
    });

    if image_entries.is_empty() {
        return Err("No images found in CBZ file".to_string());
    }

    // Extract images
    let mut pages = Vec::new();
    let mut cover_path = None;

    for (page_index, (name, entry_index)) in image_entries.iter().enumerate() {
        let mut entry = archive.by_index(*entry_index).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

        // Get image dimensions
        let (width, height) = get_image_dimensions(&buffer);

        // Save to cache
        let ext = Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let cached_name = format!("{:04}.{}", page_index, ext);
        let cached_path = book_cache_dir.join(&cached_name);
        fs::write(&cached_path, &buffer).map_err(|e| e.to_string())?;

        if page_index == 0 {
            cover_path = Some(cached_path.to_string_lossy().to_string());
        }

        pages.push(ComicPage {
            index: page_index as i64,
            file_name: name.clone(),
            width,
            height,
            image_path: cached_path.to_string_lossy().to_string(),
        });
    }

    // Detect reading mode based on aspect ratio
    let avg_ratio = pages.iter().map(|p| p.height as f64 / p.width as f64).sum::<f64>() / pages.len() as f64;
    let reading_mode = if avg_ratio > 2.0 {
        "webtoon" // Long vertical images = webtoon/scroll mode
    } else {
        "page"
    };

    let title = cbz_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let chapter = ComicChapter {
        id: uuid::Uuid::new_v4().to_string(),
        title: title.clone(),
        pages,
        sort_order: 0,
    };

    Ok(ParsedComic {
        metadata: ComicMetadata {
            title,
            author: None,
            language: "unknown".to_string(),
            total_pages: chapter.pages.len() as i64,
            reading_mode: reading_mode.to_string(),
            reading_direction: "ltr".to_string(),
            page_scaling: "fit_width".to_string(),
        },
        chapters: vec![chapter],
        cover_path,
    })
}

/// Parse a folder of images as a comic.
pub fn parse_folder(folder_path: &Path, cache_dir: &Path) -> Result<ParsedComic, String> {
    let entries: Vec<_> = fs::read_dir(folder_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().map(|ft| ft.is_file()).unwrap_or(false)
                && e.file_name()
                    .to_str()
                    .map(|n| is_image(n))
                    .unwrap_or(false)
        })
        .collect();

    if entries.is_empty() {
        return Err("No images found in folder".to_string());
    }

    let book_hash = {
        // Use folder path as hash source
        blake3::hash(folder_path.to_string_lossy().as_bytes())
            .to_hex()
            .to_string()
    };

    let book_cache_dir = cache_dir.join(&book_hash[..2]).join(&book_hash);
    fs::create_dir_all(&book_cache_dir).map_err(|e| e.to_string())?;

    // Sort entries naturally
    let mut sorted_entries: Vec<_> = entries.into_iter().collect();
    sorted_entries.sort_by(|a, b| {
        let ka = natural_sort_key(&a.file_name().to_string_lossy());
        let kb = natural_sort_key(&b.file_name().to_string_lossy());
        ka.cmp(&kb)
    });

    let mut pages = Vec::new();
    let mut cover_path = None;

    for (page_index, entry) in sorted_entries.iter().enumerate() {
        let path = entry.path();
        let buffer = fs::read(&path).map_err(|e| e.to_string())?;
        let (width, height) = get_image_dimensions(&buffer);

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let cached_name = format!("{:04}.{}", page_index, ext);
        let cached_path = book_cache_dir.join(&cached_name);
        fs::write(&cached_path, &buffer).map_err(|e| e.to_string())?;

        if page_index == 0 {
            cover_path = Some(cached_path.to_string_lossy().to_string());
        }

        pages.push(ComicPage {
            index: page_index as i64,
            file_name: entry.file_name().to_string_lossy().to_string(),
            width,
            height,
            image_path: cached_path.to_string_lossy().to_string(),
        });
    }

    let avg_ratio = pages.iter().map(|p| p.height as f64 / p.width as f64).sum::<f64>() / pages.len() as f64;
    let reading_mode = if avg_ratio > 2.0 { "webtoon" } else { "page" };

    let title = folder_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let chapter = ComicChapter {
        id: uuid::Uuid::new_v4().to_string(),
        title: title.clone(),
        pages,
        sort_order: 0,
    };

    Ok(ParsedComic {
        metadata: ComicMetadata {
            title,
            author: None,
            language: "unknown".to_string(),
            total_pages: chapter.pages.len() as i64,
            reading_mode: reading_mode.to_string(),
            reading_direction: "ltr".to_string(),
            page_scaling: "fit_width".to_string(),
        },
        chapters: vec![chapter],
        cover_path,
    })
}

/// Get image dimensions from raw bytes (simplified - reads JPEG/PNG headers)
fn get_image_dimensions(data: &[u8]) -> (i64, i64) {
    // Try PNG header
    if data.len() > 24 && data[0..8] == [137, 80, 78, 71, 13, 10, 26, 10] {
        let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]) as i64;
        let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]) as i64;
        return (width, height);
    }

    // Try JPEG header (simplified)
    if data.len() > 2 && data[0] == 0xFF && data[1] == 0xD8 {
        // Skip through markers to find SOF
        let mut i = 2;
        while i < data.len() - 1 {
            if data[i] == 0xFF {
                let marker = data[i + 1];
                if marker == 0xC0 || marker == 0xC2 {
                    // SOF marker
                    if i + 9 < data.len() {
                        let height = u16::from_be_bytes([data[i + 5], data[i + 6]]) as i64;
                        let width = u16::from_be_bytes([data[i + 7], data[i + 8]]) as i64;
                        return (width, height);
                    }
                }
                // Skip to next marker
                if i + 3 < data.len() {
                    let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
                    i += 2 + len;
                } else {
                    break;
                }
            } else {
                i += 1;
            }
        }
    }

    // Default dimensions
    (0, 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_natural_sort() {
        let mut names = vec!["page10.jpg", "page2.jpg", "page1.jpg", "page20.jpg"];
        names.sort_by(|a, b| {
            let ka = natural_sort_key(a);
            let kb = natural_sort_key(b);
            ka.cmp(&kb)
        });
        assert_eq!(names, vec!["page1.jpg", "page2.jpg", "page10.jpg", "page20.jpg"]);
    }
}
