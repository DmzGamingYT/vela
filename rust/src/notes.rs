//! Notes Markdown : de vrais fichiers `.md` dans le dossier de données.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug)]
pub struct NoteFile {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
    pub excerpt: String,
}

pub struct Notes {
    dir: PathBuf,
}

impl Notes {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        let dir = dir.into();
        let _ = std::fs::create_dir_all(&dir);
        Self { dir }
    }

    pub fn list(&self) -> Vec<NoteFile> {
        let mut notes = Vec::new();
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return notes;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            let body = std::fs::read_to_string(&path).unwrap_or_default();
            let updated_at = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or(0);
            notes.push(NoteFile {
                id: id.to_string(),
                title: title_of(&body).unwrap_or_else(|| prettify(id)),
                updated_at,
                excerpt: excerpt_of(&body),
            });
        }
        notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        notes
    }

    pub fn read(&self, id: &str) -> Option<String> {
        let path = self.path_for(id)?;
        std::fs::read_to_string(path).ok()
    }

    pub fn write(&self, id: Option<&str>, title: &str, body: &str) -> Option<String> {
        let id = match id {
            Some(id) => sanitize(id)?,
            None => slug(title),
        };
        let _ = std::fs::create_dir_all(&self.dir);
        let path = self.dir.join(format!("{id}.md"));
        let content = if body.trim().is_empty() {
            format!("# {}\n\n", if title.trim().is_empty() { "Note" } else { title.trim() })
        } else {
            body.to_string()
        };
        std::fs::write(path, content).ok()?;
        Some(id)
    }

    pub fn remove(&self, id: &str) -> bool {
        match self.path_for(id) {
            Some(path) => std::fs::remove_file(path).is_ok(),
            None => false,
        }
    }

    fn path_for(&self, id: &str) -> Option<PathBuf> {
        let id = sanitize(id)?;
        Some(self.dir.join(format!("{id}.md")))
    }
}

pub fn sanitize(id: &str) -> Option<String> {
    let cleaned: String = id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .take(80)
        .collect();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_lowercase())
    }
}

pub fn slug(title: &str) -> String {
    let mut slug = String::new();
    let mut dash = false;
    for ch in title.chars() {
        let ch = match ch {
            'à' | 'â' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' => 'i',
            'ô' | 'ö' => 'o',
            'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            other => other,
        };
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        let id = uuid::Uuid::new_v4().simple().to_string();
        format!("note-{}", &id[..8])
    } else {
        slug
    }
}

fn prettify(id: &str) -> String {
    let mut label = id.replace(['-', '_'], " ");
    if let Some(first) = label.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    label
}

fn title_of(body: &str) -> Option<String> {
    body.lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
}

fn excerpt_of(body: &str) -> String {
    body.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .take(3)
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(140)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_are_safe_and_readable() {
        assert_eq!(slug("Réunion produit"), "reunion-produit");
        assert_eq!(slug("  Notes / brief  "), "notes-brief");
        assert!(!slug("***").is_empty());
    }

    #[test]
    fn sanitize_refuses_traversal() {
        assert_eq!(sanitize("../../etc/passwd"), Some("etcpasswd".to_string()));
        assert_eq!(sanitize(""), None);
    }

    #[test]
    fn writes_lists_and_removes_notes() {
        let dir = std::env::temp_dir().join(format!("vela-notes-{}", uuid::Uuid::new_v4()));
        let notes = Notes::new(&dir);
        let id = notes
            .write(None, "Brief du jour", "# Brief du jour\n\nTrois gestes.")
            .unwrap();
        assert_eq!(id, "brief-du-jour");
        let listed = notes.list();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "Brief du jour");
        assert!(notes.read(&id).unwrap().contains("Trois gestes"));
        assert!(notes.remove(&id));
        assert!(notes.list().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
