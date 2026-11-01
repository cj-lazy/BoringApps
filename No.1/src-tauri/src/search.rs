use serde::Serialize;
use std::{fs, path::Path};

#[derive(Serialize)]
pub struct Match {
    path: String,
    line: usize,
    content: String,
}
#[derive(Serialize)]
pub struct Page {
    matches: Vec<Match>,
    has_more: bool,
    offset: usize,
    warnings: Vec<String>,
}
pub fn search(root: &Path, query: &str, offset: usize, limit: usize) -> Result<Page, String> {
    let limit = limit.clamp(1, 200);
    let mut page = Page {
        matches: vec![],
        has_more: false,
        offset,
        warnings: vec![],
    };
    if query.trim().is_empty() {
        return Ok(page);
    }
    let query = query.to_lowercase();
    let mut seen = 0;
    fn walk(
        root: &Path,
        dir: &Path,
        query: &str,
        offset: usize,
        limit: usize,
        seen: &mut usize,
        page: &mut Page,
    ) -> Result<(), String> {
        let mut entries = fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            if page.has_more {
                break;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if name.starts_with('.') || name == "assets" || kind.is_symlink() {
                continue;
            }
            let path = entry.path();
            if kind.is_dir() {
                walk(root, &path, query, offset, limit, seen, page)?;
            } else if path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("md"))
            {
                let content = match fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(e) => {
                        page.warnings.push(format!("{}: {e}", name));
                        continue;
                    }
                };
                for (line, text) in content.lines().enumerate() {
                    if !text.to_lowercase().contains(query) {
                        continue;
                    }
                    if *seen >= offset {
                        if page.matches.len() == limit {
                            page.has_more = true;
                            break;
                        }
                        page.matches.push(Match {
                            path: path
                                .strip_prefix(root)
                                .map_err(|e| e.to_string())?
                                .with_extension("")
                                .to_string_lossy()
                                .replace('\\', "/"),
                            line: line + 1,
                            content: text.to_owned(),
                        });
                    }
                    *seen += 1;
                }
            }
        }
        Ok(())
    }
    walk(root, root, &query, offset, limit, &mut seen, &mut page)?;
    Ok(page)
}
#[tauri::command]
pub async fn search_notes_page(query: String, offset: Option<usize>) -> Result<Page, String> {
    let root = super::get_data_dir();
    tauri::async_runtime::spawn_blocking(move || search(&root, &query, offset.unwrap_or(0), 100))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paging_is_stable_and_does_not_claim_a_truncated_total() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.md"), "match\nmatch\nmatch").unwrap();
        let page = search(root.path(), "match", 0, 2).unwrap();
        assert_eq!(page.matches.len(), 2);
        assert!(page.has_more);
        let page = search(root.path(), "match", 2, 2).unwrap();
        assert_eq!(page.matches[0].line, 3);
        assert!(!page.has_more);
        assert!(search(root.path(), " ", 0, 2).unwrap().matches.is_empty());
    }
}
