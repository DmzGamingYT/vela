//! Lecture et écriture de `vela.json` en Rust — spike mesuré, à parité avec
//! `JSON.parse` / `JSON.stringify`.
//!
//! Quatre points d'entrée, pour séparer ce qui coûte quoi :
//!
//! * `parse`      — JSON → objet JS (ce que ferait `JSON.parse`) ;
//! * `stringify`  — objet JS → JSON (ce que ferait `JSON.stringify`) ;
//! * `round_trip` — JSON → JSON sans traverser la frontière avec un objet :
//!   isole le coût de `serde_json` seul, sans conversion N-API ;
//! * `node_count` — parse et compte les nœuds, sans rien renvoyer de gros.
//!
//! Les chiffres et les écarts de parité connus sont dans `README.md`.

#![allow(clippy::doc_markdown)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value;

fn reason(error: serde_json::Error) -> Error {
    Error::from_reason(error.to_string())
}

/// `JSON.parse`, côté Rust. L'ordre des clés est préservé (`preserve_order`).
#[napi]
pub fn parse(text: String) -> Result<Value> {
    serde_json::from_str::<Value>(&text).map_err(reason)
}

/// `JSON.stringify`, côté Rust.
///
/// La conversion N-API d'un nombre JS perd le type entier au-delà de i32 :
/// `1763000000000` (un horodatage) arrive ici en `f64` et serde l'écrirait
/// `1763000000000.0`, là où V8 écrit `1763000000000`. On ramène donc les
/// flottants entiers dans le domaine `i64` avant de sérialiser : c'est ce qui
/// rend la sortie identique octet pour octet au fichier existant.
#[napi]
pub fn stringify(value: Value) -> Result<String> {
    let mut value = value;
    normalize_integers(&mut value);
    serde_json::to_string(&value).map_err(reason)
}

/// Flottant entier représentable en `i64` → entier. `-0.0` devient `0`,
/// comme `JSON.stringify`. Les valeurs hors domaine (1e21) restent des
/// flottants et gardent la notation exponentielle de serde, identique à V8.
fn normalize_integers(value: &mut Value) {
    match value {
        Value::Number(number) => {
            if let Some(float) = number.as_f64() {
                let integral = float.is_finite()
                    && float.fract() == 0.0
                    && float >= i64::MIN as f64
                    && float <= i64::MAX as f64;
                if integral {
                    *number = serde_json::Number::from(float as i64);
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(normalize_integers),
        Value::Object(map) => map.values_mut().for_each(normalize_integers),
        _ => {}
    }
}

/// Aller-retour texte → texte : mesure `serde_json` sans conversion d'objet.
#[napi]
pub fn round_trip(text: String) -> Result<String> {
    let value: Value = serde_json::from_str(&text).map_err(reason)?;
    serde_json::to_string(&value).map_err(reason)
}

/// Nombre de nœuds d'un document (mêmes règles de parcours que la conversion).
#[napi]
pub fn node_count(text: String) -> Result<u32> {
    fn count(value: &Value) -> u64 {
        match value {
            Value::Array(items) => 1 + items.iter().map(count).sum::<u64>(),
            Value::Object(map) => 1 + map.values().map(count).sum::<u64>(),
            _ => 1,
        }
    }
    let value: Value = serde_json::from_str(&text).map_err(reason)?;
    Ok(count(&value).min(u32::MAX as u64) as u32)
}

#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordre_des_cles_preserve() {
        let value: Value = serde_json::from_str(r#"{"z":1,"a":2,"m":3}"#).unwrap();
        assert_eq!(serde_json::to_string(&value).unwrap(), r#"{"z":1,"a":2,"m":3}"#);
    }

    #[test]
    fn aller_retour_stable() {
        let text = r#"{"tabs":[{"id":"a","url":"https://example.org/?q=é"}],"n":1}"#;
        assert_eq!(round_trip(text.to_string()).unwrap(), text);
    }
}
