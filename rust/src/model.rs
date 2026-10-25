//! État du navigateur : espaces, onglets, historique, réglages — et leur persistance.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub type Id = String;

fn new_id() -> Id {
    Uuid::new_v4().to_string()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::System
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub sidebar_collapsed: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            sidebar_collapsed: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Space {
    pub id: Id,
    pub name: String,
    pub color: String,
    /// Identifiant du magasin de données WebKit (macOS) ou du dossier WebView2 (Windows).
    pub store_id: [u8; 16],
}

impl Space {
    pub fn new(name: impl Into<String>, color: impl Into<String>) -> Self {
        let mut store_id = [0u8; 16];
        store_id.copy_from_slice(Uuid::new_v4().as_bytes());
        Self {
            id: new_id(),
            name: name.into(),
            color: color.into(),
            store_id,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum NavOrigin {
    #[default]
    User,
    Back,
    Forward,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Tab {
    pub id: Id,
    pub space_id: Id,
    pub url: String,
    pub title: String,
    pub loading: bool,
    #[serde(default)]
    pub pinned: bool,
    /// Historique de navigation tenu par l'hôte : Wry n'expose pas `can_go_back`.
    #[serde(skip)]
    pub trail: Vec<String>,
    #[serde(skip)]
    pub cursor: usize,
    #[serde(skip)]
    pub origin: NavOrigin,
}

impl Tab {
    pub fn new(space_id: impl Into<String>, url: &str) -> Self {
        let mut tab = Self {
            id: new_id(),
            space_id: space_id.into(),
            url: String::new(),
            title: String::new(),
            loading: false,
            pinned: false,
            trail: Vec::new(),
            cursor: 0,
            origin: NavOrigin::User,
        };
        tab.set_url(url, true);
        tab
    }

    pub fn set_url(&mut self, url: &str, record: bool) {
        let url = url.trim().to_string();
        if url.is_empty() {
            return;
        }
        self.url = url.clone();
        self.title = title_for(&url);
        if record {
            self.trail.truncate(self.cursor + 1);
            if self.trail.last() != Some(&url) {
                self.trail.push(url);
            }
            self.cursor = self.trail.len().saturating_sub(1);
        }
    }

    pub fn can_back(&self) -> bool {
        self.cursor > 0 && !self.trail.is_empty()
    }

    pub fn can_forward(&self) -> bool {
        !self.trail.is_empty() && self.cursor + 1 < self.trail.len()
    }

    pub fn back_url(&mut self) -> Option<String> {
        if !self.can_back() {
            return None;
        }
        self.cursor -= 1;
        self.origin = NavOrigin::Back;
        self.trail.get(self.cursor).cloned()
    }

    pub fn forward_url(&mut self) -> Option<String> {
        if !self.can_forward() {
            return None;
        }
        self.cursor += 1;
        self.origin = NavOrigin::Forward;
        self.trail.get(self.cursor).cloned()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HistoryEntry {
    pub id: Id,
    pub url: String,
    pub title: String,
    pub visited_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct State {
    pub spaces: Vec<Space>,
    pub tabs: Vec<Tab>,
    pub history: Vec<HistoryEntry>,
    pub settings: Settings,
    pub active_space: Id,
    pub active_tab: Id,
}

impl Default for State {
    fn default() -> Self {
        let space = Space::new("Personnel", "#5b7dff");
        let tab = Tab::new(&space.id, "");
        Self {
            active_space: space.id.clone(),
            active_tab: tab.id.clone(),
            spaces: vec![space],
            tabs: vec![tab],
            history: Vec::new(),
            settings: Settings::default(),
        }
    }
}

impl State {
    pub fn space(&self, id: &str) -> Option<&Space> {
        self.spaces.iter().find(|space| space.id == id)
    }

    pub fn tab(&self, id: &str) -> Option<&Tab> {
        self.tabs.iter().find(|tab| tab.id == id)
    }

    pub fn tab_mut(&mut self, id: &str) -> Option<&mut Tab> {
        self.tabs.iter_mut().find(|tab| tab.id == id)
    }

    #[allow(dead_code)]
    pub fn active(&self) -> Option<&Tab> {
        self.tab(&self.active_tab)
    }

    pub fn tabs_in_space(&self, space_id: &str) -> Vec<&Tab> {
        self.tabs
            .iter()
            .filter(|tab| tab.space_id == space_id)
            .collect()
    }

    pub fn restore(&mut self) {
        if self.spaces.is_empty() {
            *self = State::default();
            return;
        }
        if self.space(&self.active_space).is_none() {
            self.active_space = self.spaces[0].id.clone();
        }
        if self.tab(&self.active_tab).is_none() {
            match self.tabs_in_space(&self.active_space).last() {
                Some(tab) => self.active_tab = tab.id.clone(),
                None => {
                    let tab = Tab::new(&self.active_space, "");
                    self.active_tab = tab.id.clone();
                    self.tabs.push(tab);
                }
            }
        }
        self.history.truncate(300);
    }

    pub fn new_tab(&mut self, space_id: &str, url: &str) -> &Tab {
        let tab = Tab::new(space_id, url);
        self.active_tab = tab.id.clone();
        self.active_space = space_id.to_string();
        self.tabs.push(tab);
        self.tabs.last().expect("onglet ajouté")
    }

    pub fn close_tab(&mut self, id: &str) -> Option<Tab> {
        let index = self.tabs.iter().position(|tab| tab.id == id)?;
        let removed = self.tabs.remove(index);
        if self.active_tab == removed.id {
            let next = self
                .tabs_in_space(&removed.space_id)
                .last()
                .map(|tab| tab.id.clone())
                .or_else(|| self.tabs.last().map(|tab| tab.id.clone()));
            if let Some(next) = next {
                self.active_tab = next;
            }
        }
        if !self.tabs.iter().any(|tab| tab.space_id == self.active_space) {
            if let Some(space) = self.spaces.first() {
                self.active_space = space.id.clone();
            }
        }
        if self.tabs.is_empty() {
            let tab = Tab::new(&self.active_space, "");
            self.active_tab = tab.id.clone();
            self.tabs.push(tab);
        }
        Some(removed)
    }

    pub fn new_space(&mut self, name: &str, color: &str) -> &Space {
        let space = Space::new(name, color);
        self.active_space = space.id.clone();
        self.spaces.push(space);
        let tab = Tab::new(&self.active_space, "");
        self.active_tab = tab.id.clone();
        self.tabs.push(tab);
        self.spaces.last().expect("espace ajouté")
    }

    pub fn select_space(&mut self, id: &str) {
        if self.space(id).is_none() {
            return;
        }
        self.active_space = id.to_string();
        if let Some(tab) = self.tabs_in_space(id).last() {
            self.active_tab = tab.id.clone();
        }
    }

    pub fn record_visit(&mut self, url: &str, title: &str) {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return;
        }
        let title = if title.trim().is_empty() {
            title_for(url)
        } else {
            title.trim().to_string()
        };
        self.history.retain(|entry| entry.url != url);
        self.history.insert(
            0,
            HistoryEntry {
                id: new_id(),
                url: url.to_string(),
                title,
                visited_at: now_ms(),
            },
        );
        self.history.truncate(300);
    }

    pub fn rename_visit(&mut self, url: &str, title: &str) {
        if title.trim().is_empty() {
            return;
        }
        if let Some(entry) = self.history.iter_mut().find(|entry| entry.url == url) {
            entry.title = title.trim().to_string();
        }
    }
}

/// Vue envoyée à l'interface : l'historique interne des onglets reste ici.
#[derive(Serialize, Clone, Debug)]
pub struct TabView<'a> {
    pub id: &'a str,
    pub space_id: &'a str,
    pub url: &'a str,
    pub title: &'a str,
    pub loading: bool,
    pub can_back: bool,
    pub can_forward: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct StateView<'a> {
    pub spaces: &'a [Space],
    pub tabs: Vec<TabView<'a>>,
    pub history: &'a [HistoryEntry],
    pub settings: &'a Settings,
    pub active_space: &'a str,
    pub active_tab: &'a str,
}

impl<'a> StateView<'a> {
    pub fn new(state: &'a State) -> Self {
        Self {
            spaces: &state.spaces,
            tabs: state
                .tabs
                .iter()
                .map(|tab| TabView {
                    id: &tab.id,
                    space_id: &tab.space_id,
                    url: &tab.url,
                    title: &tab.title,
                    loading: tab.loading,
                    can_back: tab.can_back(),
                    can_forward: tab.can_forward(),
                })
                .collect(),
            history: &state.history,
            settings: &state.settings,
            active_space: &state.active_space,
            active_tab: &state.active_tab,
        }
    }
}

pub struct Store {
    dir: PathBuf,
    pub state: State,
}

impl Store {
    pub fn load(dir: impl Into<PathBuf>) -> Self {
        let dir = dir.into();
        let path = dir.join("state.json");
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<State>(&raw).ok())
            .unwrap_or_default();
        let mut store = Self { dir, state };
        store.state.restore();
        store
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn save(&self) {
        let path = self.dir.join("state.json");
        let _ = std::fs::create_dir_all(&self.dir);
        if let Ok(raw) = serde_json::to_string_pretty(&self.state) {
            let tmp = self.dir.join("state.json.tmp");
            if std::fs::write(&tmp, raw).is_ok() {
                let _ = std::fs::rename(tmp, path);
            }
        }
    }
}

/* --- URL ------------------------------------------------------- */

pub fn resolve_input(input: &str) -> Option<String> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }
    if let Ok(parsed) = url::Url::parse(input) {
        match parsed.scheme() {
            "http" | "https" | "file" => return Some(parsed.to_string()),
            "about" if input == "about:blank" => return Some(input.to_string()),
            _ => {}
        }
    }
    let looks_like_host = !input.contains(char::is_whitespace)
        && (input.contains('.') || input.starts_with("localhost") || input.contains("://"));
    if looks_like_host {
        let scheme = if input.starts_with("localhost") || input.starts_with("127.") {
            "http://"
        } else {
            "https://"
        };
        if let Ok(parsed) = url::Url::parse(&format!("{scheme}{input}")) {
            return Some(parsed.to_string());
        }
    }
    Some(search_url(input))
}

pub fn search_url(query: &str) -> String {
    let mut encoded = String::new();
    for byte in query.trim().as_bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            b' ' => encoded.push('+'),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    format!("https://duckduckgo.com/?q={encoded}")
}

pub fn title_for(url: &str) -> String {
    if url.is_empty() {
        return "Nouvel onglet".to_string();
    }
    url::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(|host| host.trim_start_matches("www.").to_string()))
        .unwrap_or_else(|| url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_urls_and_queries() {
        assert_eq!(resolve_input("example.com").unwrap(), "https://example.com/");
        assert_eq!(resolve_input("http://example.com/a").unwrap(), "http://example.com/a");
        assert_eq!(resolve_input("localhost:3000").unwrap(), "http://localhost:3000/");
        assert!(resolve_input("deux mots").unwrap().starts_with("https://duckduckgo.com/?q=deux+mots"));
        assert_eq!(resolve_input("   "), None);
    }

    #[test]
    fn search_encodes_accents() {
        assert_eq!(
            search_url("météo paris"),
            "https://duckduckgo.com/?q=m%C3%A9t%C3%A9o+paris"
        );
    }

    #[test]
    fn titles_fall_back_to_host() {
        assert_eq!(title_for("https://www.lemonde.fr/sciences"), "lemonde.fr");
        assert_eq!(title_for(""), "Nouvel onglet");
    }

    #[test]
    fn tabs_record_a_trail_and_redo_it() {
        let mut state = State::default();
        let space = state.spaces[0].id.clone();
        let id = state.new_tab(&space, "https://example.com").id.clone();
        let tab = state.tab_mut(&id).unwrap();
        tab.set_url("https://example.com/a", true);
        tab.set_url("https://example.com/b", true);
        assert!(tab.can_back());
        assert!(!tab.can_forward());
        assert_eq!(tab.back_url().unwrap(), "https://example.com/a");
        assert_eq!(tab.back_url().unwrap(), "https://example.com");
        assert!(!tab.can_back());
        assert_eq!(tab.forward_url().unwrap(), "https://example.com/a");
        assert!(tab.can_forward());
        tab.set_url("https://example.com/c", true);
        assert!(!tab.can_forward());
        assert_eq!(tab.url, "https://example.com/c");
    }

    #[test]
    fn closing_the_active_tab_picks_a_sibling() {
        let mut state = State::default();
        let space = state.spaces[0].id.clone();
        let first = state.new_tab(&space, "https://a.example").id.clone();
        let second = state.new_tab(&space, "https://b.example").id.clone();
        assert_eq!(state.active_tab, second);
        state.close_tab(&second);
        assert_eq!(state.active_tab, first);
        state.close_tab(&first);
        assert!(state.tabs.iter().any(|tab| tab.space_id == space));
    }

    #[test]
    fn spaces_keep_their_own_data_store() {
        let mut state = State::default();
        let a = state.spaces[0].store_id;
        let created = state.new_space("Travail", "#a88cff");
        let b = created.store_id;
        assert_ne!(a, b);
        assert_eq!(state.tabs_in_space(&state.spaces[1].id).len(), 1);
    }

    #[test]
    fn visits_are_deduped_and_capped() {
        let mut state = State::default();
        state.record_visit("https://example.com", "Example");
        state.record_visit("https://example.com", "Example 2");
        assert_eq!(state.history.len(), 1);
        assert_eq!(state.history[0].title, "Example 2");
        for index in 0..310 {
            state.record_visit(&format!("https://site{index}.example"), "Site");
        }
        assert_eq!(state.history.len(), 300);
    }

    #[test]
    fn state_survives_a_round_trip() {
        let dir = std::env::temp_dir().join(format!("vela-shell-test-{}", Uuid::new_v4()));
        let mut store = Store::load(&dir);
        store.state.new_space("Recherche", "#62c8ff");
        let active = store.state.active_space.clone();
        store.state.new_tab(&active, "https://example.com");
        store.state.record_visit("https://example.com", "Example");
        store.state.settings.theme = Theme::Light;
        store.save();

        let reloaded = Store::load(&dir);
        assert_eq!(reloaded.state.spaces.len(), 2);
        assert_eq!(reloaded.state.active_space, active);
        assert_eq!(reloaded.state.history[0].url, "https://example.com");
        assert_eq!(reloaded.state.settings.theme, Theme::Light);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
