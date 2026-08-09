use crate::error::{sanitize_error, AppError, AppResult};
use crate::models::{ComicChapter, ComicMetadata, ComicPage};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"];

/// Validate that an archive entry path is safe to extract (no path traversal).
/// Returns `true` if the path is safe, `false` if it contains suspicious patterns.
fn is_safe_entry_path(name: &str) -> bool {
    // Normalize backslashes to forward slashes
    let sanitized = name.replace('\\', "/");
    // Reject absolute paths and traversal attempts
    !sanitized.starts_with('/') && !sanitized.contains("..") && !sanitized.contains('\0')
}

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
                // Zero-pad numeric parts so string comparison gives numeric ordering
                if in_digit {
                    parts.push(format!("{:0>20}", current));
                } else {
                    parts.push(current.clone());
                }
                current.clear();
            }
            in_digit = c.is_ascii_digit();
        }
        current.push(c);
    }
    if !current.is_empty() {
        if in_digit {
            parts.push(format!("{:0>20}", current));
        } else {
            parts.push(current);
        }
    }
    parts
}

pub struct ParsedComic {
    pub metadata: ComicMetadata,
    pub chapters: Vec<ComicChapter>,
    pub cover_path: Option<String>,
    /// ComicRack 标准 ComicInfo.xml 元数据（仅 CBZ 可能包含）
    pub comic_info: Option<ComicInfo>,
}

/// ComicRack ComicInfo.xml 提取的子集（PLAN 3.4.2）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ComicInfo {
    pub title: Option<String>,
    pub writer: Option<String>,
    pub series: Option<String>,
    pub volume: Option<String>,
    pub year: Option<String>,
    pub summary: Option<String>,
}

/// 极简 XML 标签提取（ComicInfo.xml 结构简单，无需完整 XML 解析器）。
fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let s = xml.find(&open)? + open.len();
    let e = xml[s..].find(&close)?;
    let v = xml[s..s + e].trim();
    if v.is_empty() { None } else { Some(v.to_string()) }
}

/// 解析 ComicInfo.xml 内容。
fn parse_comic_info(xml: &str) -> Option<ComicInfo> {
    if !xml.contains("<ComicInfo") {
        return None;
    }
    Some(ComicInfo {
        title: extract_tag(xml, "Title"),
        writer: extract_tag(xml, "Writer"),
        series: extract_tag(xml, "Series"),
        volume: extract_tag(xml, "Volume"),
        year: extract_tag(xml, "Year"),
        summary: extract_tag(xml, "Summary"),
    })
}

/// 从 CBZ 压缩包读取 ComicInfo.xml（根目录或任意子目录）。
fn read_comic_info(archive: &mut zip::ZipArchive<fs::File>) -> Option<ComicInfo> {
    use std::io::Read;
    for i in 0..archive.len() {
        let name = archive.by_index(i).ok()?.name().to_lowercase();
        if name == "comicinfo.xml" || name.ends_with("/comicinfo.xml") {
            let mut entry = archive.by_index(i).ok()?;
            let mut content = String::new();
            entry.read_to_string(&mut content).ok()?;
            return parse_comic_info(&content);
        }
    }
    None
}

/// Parse a CBZ file. Extracts images to cache directory.
pub fn parse_cbz(cbz_path: &Path, cache_dir: &Path) -> AppResult<ParsedComic> {
    let file = fs::File::open(cbz_path).map_err(|e| AppError::Parse(sanitize_error(format!("Failed to open CBZ: {}", e))))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| AppError::Parse(sanitize_error(format!("Failed to read ZIP: {}", e))))?;

    let book_hash = {
        let data = fs::read(cbz_path).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;
        blake3::hash(&data).to_hex().to_string()
    };

    let book_cache_dir = cache_dir.join(&book_hash[..2]).join(&book_hash);
    fs::create_dir_all(&book_cache_dir).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;

    let comic_info = read_comic_info(&mut archive);

    // Collect image entries
    let mut image_entries: Vec<(String, usize)> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;
        let name = entry.name().to_string();
        if !is_safe_entry_path(&name) {
            continue; // Skip entries with path traversal attempts
        }
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
        return Err(AppError::Parse("No images found in CBZ file".to_string()));
    }

    // Extract images
    let mut pages = Vec::new();
    let mut cover_path = None;

    for (page_index, (name, entry_index)) in image_entries.iter().enumerate() {
        let mut entry = archive.by_index(*entry_index).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;
        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;

        // Get image dimensions
        let (width, height) = get_image_dimensions(&buffer);

        // Save to cache — use only the filename component, never the full entry path
        let ext = Path::new(name)
            .file_name() // strip any directory components from the archive entry
            .and_then(|f| Path::new(f).extension())
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let cached_name = format!("{:04}.{}", page_index, ext);
        let cached_path = book_cache_dir.join(&cached_name);
        fs::write(&cached_path, &buffer).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;

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
        comic_info,
    })
}

/// Parse a folder of images as a comic.
pub fn parse_folder(folder_path: &Path, cache_dir: &Path) -> AppResult<ParsedComic> {
    let entries: Vec<_> = fs::read_dir(folder_path)
        .map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?
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
        return Err(AppError::Parse("No images found in folder".to_string()));
    }

    let book_hash = {
        // Use folder path as hash source
        blake3::hash(folder_path.to_string_lossy().as_bytes())
            .to_hex()
            .to_string()
    };

    let book_cache_dir = cache_dir.join(&book_hash[..2]).join(&book_hash);
    fs::create_dir_all(&book_cache_dir).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;

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
        let buffer = fs::read(&path).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;
        let (width, height) = get_image_dimensions(&buffer);

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let cached_name = format!("{:04}.{}", page_index, ext);
        let cached_path = book_cache_dir.join(&cached_name);
        fs::write(&cached_path, &buffer).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;

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
        comic_info: None,
    })
}

/// Parse a CBR (RAR) file. Extracts images to cache directory.
pub fn parse_cbr(cbr_path: &Path, cache_dir: &Path) -> AppResult<ParsedComic> {
    let book_hash = {
        let data = fs::read(cbr_path).map_err(|e| AppError::Parse(sanitize_error(format!("Failed to read CBR: {}", e))))?;
        blake3::hash(&data).to_hex().to_string()
    };

    let book_cache_dir = cache_dir.join(&book_hash[..2]).join(&book_hash);
    fs::create_dir_all(&book_cache_dir).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;

    // Extract RAR entries to cache directory
    let mut archive = unrar::Archive::new(cbr_path)
        .open_for_processing()
        .map_err(|e| AppError::Parse(sanitize_error(format!("Failed to open CBR: {}", e))))?;

    let mut image_entries: Vec<(String, PathBuf)> = Vec::new();

    while let Some(header) = archive
        .read_header()
        .map_err(|e| AppError::Parse(sanitize_error(format!("Failed to read CBR header: {}", e))))?
    {
        let filename = header.entry().filename.to_string_lossy().to_string();

        // Reject entries with path traversal attempts
        if !is_safe_entry_path(&filename) {
            archive = header
                .skip()
                .map_err(|e| AppError::Parse(sanitize_error(format!("Failed to skip CBR entry: {}", e))))?;
            continue;
        }

        if header.entry().is_file() && is_image(&filename) && !filename.starts_with("__MACOSX") {
            let ext = Path::new(&filename)
                .file_name() // strip directory components
                .and_then(|f| Path::new(f).extension())
                .and_then(|e| e.to_str())
                .unwrap_or("jpg");
            let index = image_entries.len();
            let cached_name = format!("{:04}.{}", index, ext);
            let cached_path = book_cache_dir.join(&cached_name);

            archive = header
                .extract_to(&cached_path)
                .map_err(|e| AppError::Parse(sanitize_error(format!("Failed to extract CBR entry: {}", e))))?;

            image_entries.push((filename, cached_path));
        } else {
            archive = header
                .skip()
                .map_err(|e| AppError::Parse(sanitize_error(format!("Failed to skip CBR entry: {}", e))))?;
        }
    }

    // Natural sort by filename
    image_entries.sort_by(|a, b| {
        let ka = natural_sort_key(&a.0);
        let kb = natural_sort_key(&b.0);
        ka.cmp(&kb)
    });

    if image_entries.is_empty() {
        return Err(AppError::Parse("No images found in CBR file".to_string()));
    }

    // Rename files to match sorted order and build pages
    let mut pages = Vec::new();
    let mut cover_path = None;

    for (page_index, (name, cached_path)) in image_entries.iter().enumerate() {
        let buffer = fs::read(cached_path).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;
        let (width, height) = get_image_dimensions(&buffer);

        let ext = cached_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let sorted_name = format!("{:04}.{}", page_index, ext);
        let sorted_path = book_cache_dir.join(&sorted_name);

        // Rename if needed (only when order changed)
        if cached_path != &sorted_path {
            fs::rename(cached_path, &sorted_path).map_err(|e| AppError::Parse(sanitize_error(e.to_string())))?;
        }

        if page_index == 0 {
            cover_path = Some(sorted_path.to_string_lossy().to_string());
        }

        pages.push(ComicPage {
            index: page_index as i64,
            file_name: name.clone(),
            width,
            height,
            image_path: sorted_path.to_string_lossy().to_string(),
        });
    }

    let avg_ratio = pages.iter().map(|p| p.height as f64 / p.width as f64).sum::<f64>() / pages.len() as f64;
    let reading_mode = if avg_ratio > 2.0 { "webtoon" } else { "page" };

    let title = cbr_path
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
        comic_info: None,
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

    #[test]
    fn parse_cbz_reads_comic_info() {
        // PLAN 3.4.2：ComicRack 标准 ComicInfo.xml 应被提取
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("yiyue-cbz-test-{}", uuid::Uuid::new_v4()));
        let cache = dir.join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        let path = dir.join("book.cbz");
        let file = std::fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let def = zip::write::SimpleFileOptions::default();
        zip.start_file("ComicInfo.xml", def).unwrap();
        zip.write_all(
            r#"<?xml version="1.0"?>
<ComicInfo>
  <Title>测试漫画</Title>
  <Writer>作者乙</Writer>
  <Series>系列X</Series>
  <Volume>3</Volume>
  <Year>2020</Year>
  <Summary>这是一个测试摘要</Summary>
</ComicInfo>"#
            .as_bytes(),
        )
        .unwrap();
        // 标准 1x1 PNG
        zip.start_file("page1.png", def).unwrap();
        zip.write_all(&[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
            0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
            0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ])
        .unwrap();
        zip.finish().unwrap();

        let comic = super::parse_cbz(&path, &cache).expect("CBZ 应能解析");
        let ci = comic.comic_info.expect("应读到 ComicInfo");
        assert_eq!(ci.title.as_deref(), Some("测试漫画"));
        assert_eq!(ci.writer.as_deref(), Some("作者乙"));
        assert_eq!(ci.series.as_deref(), Some("系列X"));
        assert_eq!(ci.volume.as_deref(), Some("3"));
        assert_eq!(ci.year.as_deref(), Some("2020"));
        assert_eq!(ci.summary.as_deref(), Some("这是一个测试摘要"));
        // 非漫画格式目录不应有 comic_info
        assert!(comic.metadata.total_pages > 0, "应有至少一页");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn parse_comic_info_missing_returns_none() {
        assert!(parse_comic_info("<html>no comic info here</html>").is_none());
        assert!(parse_comic_info("<ComicInfo><Title>x</Title></ComicInfo>").is_some());
    }

}
