//! Port Rust de `src/main/blocklist.ts` — même logique, même listes.
//! Les listes vivent dans `hosts.rs` (généré depuis le TS, voir
//! `scripts/gen-blocklist-rs.cjs`) : la source de vérité reste le TS.
//!
//! Choix d'implémentation (mesurés, voir `scripts/bench-blocklist.mjs`) :
//! recherche dichotomique sur listes triées plutôt que `HashSet` — à 125
//! entrées, le hash (SipHash par défaut) coûtait plus cher que ~7 comparaisons.

#![allow(clippy::doc_markdown)]

use napi_derive::napi;

mod hosts;

fn sorted_trackers() -> &'static [&'static str] {
    use std::sync::OnceLock;
    static INDEX: OnceLock<Vec<&'static str>> = OnceLock::new();
    INDEX.get_or_init(|| {
        let mut v: Vec<&str> = hosts::TRACKER_HOSTS.to_vec();
        v.sort_unstable();
        v.dedup();
        v
    })
}

fn sorted_auth() -> &'static [&'static str] {
    use std::sync::OnceLock;
    static INDEX: OnceLock<Vec<&'static str>> = OnceLock::new();
    INDEX.get_or_init(|| {
        let mut v: Vec<&str> = hosts::AUTH_PAGE_HOSTS.to_vec();
        v.sort_unstable();
        v.dedup();
        v
    })
}

/// Le domaine ou l'un de ses parents appartient-il à `sorted` ?
fn matches(host: &str, sorted: &[&str]) -> bool {
    let mut candidate = host;
    loop {
        if sorted.binary_search(&candidate).is_ok() {
            return true;
        }
        match candidate.find('.') {
            Some(dot) => candidate = &candidate[dot + 1..],
            None => return false,
        }
    }
}

/// Hôte d'une URL sans construire d'objet `URL` — même lecture rapide que le TS.
/// IPv6 littéral : le TS retombe sur `new URL()`, dont `hostname` garde les
/// crochets (`[::1]`) ; on réplique ce résultat pour rester à parité.
fn host_of(url: &str) -> &str {
    let Some(scheme) = url.find("://") else {
        return "";
    };
    let bytes = url.as_bytes();
    let mut start = scheme + 3;
    if start >= bytes.len() {
        return "";
    }
    if bytes[start] == b'[' {
        return match url[start..].find(']') {
            Some(close) => &url[start..start + close + 1],
            None => "",
        };
    }
    // Identifiants éventuels : user:secret@hôte
    if let Some(slash) = url[start..].find('/') {
        if let Some(at) = url[start..start + slash].find('@') {
            start += at + 1;
        }
    } else if let Some(at) = url[start..].find('@') {
        start += at + 1;
    }
    let mut end = url.len();
    for (offset, &b) in bytes[start..].iter().enumerate() {
        if b == b'/' || b == b'?' || b == b'#' || b == b':' {
            end = start + offset;
            break;
        }
    }
    if end <= start {
        return "";
    }
    &url[start..end]
}

/// Minuscules sans allocation quand l'hôte est déjà en minuscules (cas courant).
#[inline]
fn host_lower<'a>(host: &'a str, buf: &'a mut String) -> &'a str {
    if host.bytes().any(|b| b.is_ascii_uppercase()) {
        buf.clear();
        buf.push_str(host);
        buf.make_ascii_lowercase();
        buf.as_str()
    } else {
        host
    }
}

fn is_tracker_str(url: &str) -> bool {
    let mut buf = String::new();
    let host = host_lower(host_of(url), &mut buf);
    if host.is_empty() {
        return false;
    }
    matches(host, sorted_trackers())
}

fn is_auth_page_str(url: &str) -> bool {
    let mut buf = String::new();
    let host = host_lower(host_of(url), &mut buf);
    if host.is_empty() {
        return false;
    }
    matches(host, sorted_auth())
}

#[napi]
pub fn is_tracker(url: String) -> bool {
    is_tracker_str(&url)
}

#[napi]
pub fn is_auth_page(url: String) -> bool {
    is_auth_page_str(&url)
}

fn is_multi_suffix(two: &str) -> bool {
    matches!(
        two,
        "co.uk" | "org.uk" | "ac.uk" | "gov.uk" | "com.au" | "net.au" | "co.jp" | "co.kr"
            | "com.br" | "com.mx" | "co.nz" | "co.za" | "com.tr" | "com.cn" | "co.in"
    )
}

fn is_ipv4(parts: &[&str]) -> bool {
    parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.bytes().all(|b| b.is_ascii_digit()))
}

fn registrable(host: &str) -> String {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() <= 2 || is_ipv4(&parts) {
        return host.to_string();
    }
    let two = parts[parts.len() - 2..].join(".");
    if is_multi_suffix(&two) {
        parts[parts.len() - 3..].join(".")
    } else {
        two
    }
}

#[napi]
pub fn is_third_party(url: String, page_url: String) -> bool {
    let mut buf = String::new();
    let host = host_lower(host_of(&url), &mut buf).to_string();
    let mut buf2 = String::new();
    let page = host_lower(host_of(&page_url), &mut buf2).to_string();
    if host.is_empty() || page.is_empty() {
        return false;
    }
    !(host == page || registrable(&host) == registrable(&page))
}

#[napi]
pub fn is_strict_type(resource_type: String) -> bool {
    matches!(
        resource_type.as_str(),
        "script" | "subFrame" | "xhr" | "ping" | "media" | "websocket" | "other"
    )
}

#[napi]
pub fn should_block(url: String, page_url: String, resource_type: String, level: String) -> bool {
    if is_tracker_str(&url) {
        return true;
    }
    if level != "strict" {
        return false;
    }
    if !is_strict_type(resource_type) {
        return false;
    }
    is_third_party(url, page_url)
}

#[napi]
pub fn tracker_count() -> u32 {
    hosts::TRACKER_HOSTS.len() as u32
}

#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traqueurs_connus() {
        assert!(is_tracker("https://www.google-analytics.com/g/collect".into()));
        assert!(is_tracker("https://stats.g.doubleclick.net/collect?v=1".into()));
        assert!(is_tracker("https://ib.adnxs.com/getuid?cb=1".into()));
    }

    #[test]
    fn sites_ordinaires() {
        assert!(!is_tracker("https://example.org/article".into()));
        assert!(!is_tracker("https://notdoubleclick.net/".into()));
        assert!(!is_tracker("https://example.org/?u=doubleclick.net".into()));
    }

    #[test]
    fn auth() {
        assert!(is_auth_page("https://accounts.google.com/ServiceLogin".into()));
        assert!(!is_auth_page("https://mail.google.com/".into()));
        assert!(!is_auth_page("not a url".into()));
    }

    #[test]
    fn niveaux() {
        assert!(should_block(
            "https://cdn.autre.fr/app.js".into(),
            "https://example.fr/".into(),
            "script".into(),
            "strict".into()
        ));
        assert!(!should_block(
            "https://cdn.autre.fr/photo.jpg".into(),
            "https://example.fr/".into(),
            "image".into(),
            "strict".into()
        ));
        assert!(!should_block(
            "https://cdn.example.fr/app.js".into(),
            "https://www.example.fr/".into(),
            "script".into(),
            "strict".into()
        ));
    }
}
