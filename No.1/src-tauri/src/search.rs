use serde::Serialize;
use std::path::Path;

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
    let snapshot = crate::catalog::snapshot(root, false)?;
    page.warnings = snapshot.warnings;
    let mut seen = 0;
    for note in snapshot.notes {
        for (line, (text, lower)) in note.source.lines().zip(note.lower.lines()).enumerate() {
            if !lower.contains(&query) {
                continue;
            }
            if seen >= offset {
                if page.matches.len() == limit {
                    page.has_more = true;
                    break;
                }
                page.matches.push(Match {
                    path: note.path.clone(),
                    line: line + 1,
                    content: text.to_owned(),
                });
            }
            seen += 1;
        }
        if page.has_more {
            break;
        }
    }
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
    use std::fs;
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
