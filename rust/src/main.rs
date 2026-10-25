//! Vela — coque de navigateur en Rust.
//!
//! WebKit (WKWebView) sur macOS, WebView2 sur Windows. Chaque espace possède son propre
//! magasin de données : WebKit `WKWebsiteDataStore` nommé, ou dossier utilisateur WebView2.
//! L'interface (chrome) est servie depuis le binaire via le protocole `vela://` et pilote
//! des webviews enfants par-dessus la zone de contenu.

mod model;
mod notes;

use model::{resolve_input, NavOrigin, Space, StateView, Store, Tab, Theme};
use notes::Notes;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::{Window, WindowBuilder},
};
use wry::dpi::{LogicalPosition, LogicalSize as WryLogicalSize};
use wry::{
    http::{header::CONTENT_TYPE, Request, Response},
    NewWindowResponse, PageLoadEvent, Rect, WebView, WebViewBuilder,
};

#[cfg(target_os = "macos")]
use wry::WebViewBuilderExtDarwin;

#[cfg(target_os = "windows")]
use wry::WebContext;

const CHROME_HTML: &str = include_str!("../ui/index.html");
const CHROME_CSS: &str = include_str!("../ui/styles.css");
const CHROME_JS: &str = include_str!("../ui/app.js");

enum UserEvent {
    Ipc(String),
    TabTitle(String, String),
    TabLoad(String, PageLoadEvent, String),
    NewTab(String, String),
    Resize,
    Timeout,
}

struct App {
    window: Window,
    chrome: WebView,
    proxy: EventLoopProxy<UserEvent>,
    store: Store,
    notes: Notes,
    views: HashMap<String, WebView>,
    overlay: bool,
    smoke: bool,
    /// Rectangle de la zone de contenu, en pixels logiques, relatif à la fenêtre.
    content: Option<Rect>,
    #[cfg(target_os = "windows")]
    contexts: HashMap<String, WebContext>,
}

impl App {
    fn new(window: Window, proxy: EventLoopProxy<UserEvent>) -> Self {
        let data_dir = data_dir();
        let store = Store::load(&data_dir);
        let notes = Notes::new(data_dir.join("notes"));

        let ipc_proxy = proxy.clone();
        let chrome = {
            let builder = WebViewBuilder::new()
                .with_ipc_handler(move |request: Request<String>| {
                    let _ = ipc_proxy.send_event(UserEvent::Ipc(request.body().clone()));
                })
                .with_devtools(cfg!(debug_assertions))
                .with_custom_protocol("vela".into(), |_id, request| serve_asset(&request));

            match std::env::var("VELA_DEV_URL") {
                Ok(url) if !url.is_empty() => builder.with_url(url),
                _ => builder.with_url("vela://localhost/index.html"),
            }
            .build(&window)
            .expect("interface impossible à charger")
        };

        Self {
            window,
            chrome,
            proxy,
            store,
            notes,
            views: HashMap::new(),
            overlay: false,
            smoke: std::env::args().any(|arg| arg == "--selftest"),
            content: None,
            #[cfg(target_os = "windows")]
            contexts: HashMap::new(),
        }
    }

    fn save(&self) {
        self.store.save();
    }

    fn dir(&self) -> PathBuf {
        self.store.dir().to_path_buf()
    }

    fn content_bounds(&self) -> Rect {
        self.content.unwrap_or_else(|| {
            let size = self.window.inner_size();
            let scale = self.window.scale_factor();
            let logical: LogicalSize<f64> = size.to_logical(scale);
            Rect {
                position: LogicalPosition::new(0.0, 0.0).into(),
                size: WryLogicalSize::new(logical.width.max(1.0), logical.height.max(1.0)).into(),
            }
        })
    }

    fn sync_visibility(&mut self) {
        let active = self.store.state.active_tab.clone();
        let active_space = self.store.state.active_space.clone();
        let mut to_focus: Option<String> = None;
        for (tab_id, view) in &self.views {
            let tab = self.store.state.tab(tab_id);
            let is_active = *tab_id == active && tab.map(|tab| tab.space_id == active_space).unwrap_or(false);
            let has_url = tab.map(|tab| !tab.url.is_empty()).unwrap_or(false);
            let visible = is_active && has_url && !self.overlay;
            let _ = view.set_visible(visible);
            if visible {
                to_focus = Some(tab_id.clone());
            }
        }
        if self.overlay {
            let _ = self.chrome.focus();
        } else if let Some(id) = to_focus {
            if let Some(view) = self.views.get(&id) {
                let _ = view.focus();
            }
        }
    }

    fn ensure_view(&mut self, tab_id: &str) {
        if self.views.contains_key(tab_id) {
            return;
        }
        let Some(tab) = self.store.state.tab(tab_id).cloned() else {
            return;
        };
        if tab.url.is_empty() {
            return;
        }
        let Some(space) = self.store.state.space(&tab.space_id).cloned() else {
            return;
        };
        if let Some(view) = self.build_tab_view(&tab, &space) {
            self.views.insert(tab.id.clone(), view);
        }
    }

    fn build_tab_view(&mut self, tab: &Tab, space: &Space) -> Option<WebView> {
        #[cfg(target_os = "macos")]
        let view = configure_tab_view(
            WebViewBuilder::new(),
            self.proxy.clone(),
            tab,
            self.content_bounds(),
        )
        .with_data_store_identifier(space.store_id)
        .build_as_child(&self.window)
        .ok();

        #[cfg(target_os = "windows")]
        let view = {
            let path = self.dir().join("spaces").join(hex(&space.store_id));
            let _ = std::fs::create_dir_all(&path);
            let context = self
                .contexts
                .entry(space.id.clone())
                .or_insert_with(|| WebContext::new(Some(path)));
            configure_tab_view(
                WebViewBuilder::new_with_web_context(context),
                self.proxy.clone(),
                tab,
                self.content_bounds(),
            )
            .build_as_child(&self.window)
            .ok()
        };

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let view = configure_tab_view(
            WebViewBuilder::new(),
            self.proxy.clone(),
            tab,
            self.content_bounds(),
        )
        .build_as_child(&self.window)
        .ok();

        view
    }

    fn close_view(&mut self, tab_id: &str) {
        self.views.remove(tab_id);
    }

    fn navigate(&mut self, tab_id: &str, input: &str) -> Result<Value, String> {
        let Some(url) = resolve_input(input) else {
            return Err("adresse vide".into());
        };
        let Some(tab) = self.store.state.tab_mut(tab_id) else {
            return Err("onglet inconnu".into());
        };
        tab.set_url(&url, true);
        tab.origin = NavOrigin::User;
        tab.loading = true;
        self.ensure_view(tab_id);
        if let Some(view) = self.views.get(tab_id) {
            let _ = view.load_url(&url);
        }
        self.after_mutation();
        Ok(Value::Null)
    }

    fn step(&mut self, tab_id: &str, forward: bool) -> Result<Value, String> {
        let Some(tab) = self.store.state.tab_mut(tab_id) else {
            return Err("onglet inconnu".into());
        };
        let target = if forward { tab.forward_url() } else { tab.back_url() };
        let Some(url) = target else {
            return Ok(Value::Null);
        };
        tab.url = url.clone();
        tab.title = model::title_for(&url);
        tab.loading = true;
        self.ensure_view(tab_id);
        if let Some(view) = self.views.get(tab_id) {
            let _ = view.load_url(&url);
        }
        self.after_mutation();
        Ok(Value::Null)
    }

    fn select_tab(&mut self, tab_id: &str) -> Result<Value, String> {
        let Some(tab) = self.store.state.tab(tab_id) else {
            return Err("onglet inconnu".into());
        };
        let (tab_id, space_id) = (tab.id.clone(), tab.space_id.clone());
        self.store.state.active_tab = tab_id.clone();
        self.store.state.active_space = space_id;
        self.ensure_view(&tab_id);
        self.after_mutation();
        Ok(Value::Null)
    }

    fn create_tab(&mut self, space_id: Option<&str>, url: Option<&str>) -> Result<Value, String> {
        let space_id = space_id
            .map(str::to_string)
            .unwrap_or_else(|| self.store.state.active_space.clone());
        let url = url.map(|raw| resolve_input(raw).unwrap_or_else(|| raw.to_string())).unwrap_or_default();
        let id = {
            let tab = self.store.state.new_tab(&space_id, &url);
            tab.id.clone()
        };
        self.ensure_view(&id);
        self.after_mutation();
        Ok(json!({ "id": id }))
    }

    fn close_tab(&mut self, tab_id: &str) -> Result<Value, String> {
        self.close_view(tab_id);
        self.store.state.close_tab(tab_id);
        let active = self.store.state.active_tab.clone();
        self.ensure_view(&active);
        self.after_mutation();
        Ok(Value::Null)
    }

    fn after_mutation(&mut self) {
        self.sync_visibility();
        self.send_state();
        self.save();
    }

    fn send_state(&self) {
        let view = StateView::new(&self.store.state);
        let state = serde_json::to_value(&view).unwrap_or(Value::Null);
        self.emit(json!({ "type": "state", "data": state }));
    }

    fn send_notes(&self) {
        let notes = self.notes.list();
        self.emit(json!({ "type": "notes", "data": notes }));
    }

    fn emit(&self, payload: Value) {
        let script = format!(
            "window.__vela && window.__vela.event({});",
            serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into())
        );
        let _ = self.chrome.evaluate_script(&script);
    }

    fn respond(&self, id: u64, result: Result<Value, String>) {
        let payload = match result {
            Ok(data) => json!({ "id": id, "ok": true, "data": data }),
            Err(error) => json!({ "id": id, "ok": false, "error": error }),
        };
        let script = format!(
            "window.__vela && window.__vela.receive({});",
            serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into())
        );
        let _ = self.chrome.evaluate_script(&script);
    }

    fn on_ipc(&mut self, body: &str) {
        #[derive(Deserialize)]
        struct Message {
            id: u64,
            cmd: String,
            #[serde(default)]
            args: Value,
        }
        let Ok(message) = serde_json::from_str::<Message>(body) else {
            return;
        };
        let id = message.id;
        let args = message.args;
        let arg = |key: &str| args.get(key).and_then(Value::as_str).map(str::to_string);

        let result = match message.cmd.as_str() {
            "init" => {
                if self.smoke {
                    self.smoke_start();
                }
                Ok(json!({
                    "state": serde_json::to_value(StateView::new(&self.store.state)).unwrap_or(Value::Null),
                    "notes": self.notes.list(),
                    "platform": std::env::consts::OS,
                    "dataDir": self.dir().to_string_lossy(),
                    "version": env!("CARGO_PKG_VERSION"),
                    "isolation": if cfg!(any(target_os = "macos", target_os = "windows")) { "native" } else { "shared" },
                }))
            }
            "tab.create" => self.create_tab(arg("spaceId").as_deref(), arg("url").as_deref()),
            "tab.close" => match arg("id") {
                Some(id) => self.close_tab(&id),
                None => Err("id manquant".into()),
            },
            "tab.select" => match arg("id") {
                Some(id) => self.select_tab(&id),
                None => Err("id manquant".into()),
            },
            "tab.navigate" => match (arg("id"), arg("url")) {
                (Some(tab), Some(url)) => self.navigate(&tab, &url),
                _ => Err("onglet ou adresse manquant".into()),
            },
            "tab.back" => match arg("id") {
                Some(id) => self.step(&id, false),
                None => Err("id manquant".into()),
            },
            "tab.forward" => match arg("id") {
                Some(id) => self.step(&id, true),
                None => Err("id manquant".into()),
            },
            "tab.reload" => {
                if let Some(view) = arg("id").and_then(|id| self.views.get(&id)) {
                    let _ = view.reload();
                }
                Ok(Value::Null)
            }
            "tab.stop" => {
                if let Some(view) = arg("id").and_then(|id| self.views.get(&id)) {
                    let _ = view.evaluate_script("window.stop();");
                }
                if let Some(tab) = arg("id").and_then(|id| self.store.state.tab_mut(&id)) {
                    tab.loading = false;
                }
                self.send_state();
                Ok(Value::Null)
            }
            "space.create" => {
                let name = arg("name").unwrap_or_else(|| "Nouvel espace".into());
                let color = arg("color").unwrap_or_else(|| "#5b7dff".into());
                let id = {
                    let space = self.store.state.new_space(&name, &color);
                    space.id.clone()
                };
                self.after_mutation();
                Ok(json!({ "id": id }))
            }
            "space.select" => {
                if let Some(id) = arg("id") {
                    self.store.state.select_space(&id);
                    let active = self.store.state.active_tab.clone();
                    self.ensure_view(&active);
                    self.after_mutation();
                }
                Ok(Value::Null)
            }
            "settings.update" => {
                if let Some(theme) = arg("theme") {
                    self.store.state.settings.theme = match theme.as_str() {
                        "light" => Theme::Light,
                        "dark" => Theme::Dark,
                        _ => Theme::System,
                    };
                }
                if let Some(collapsed) = args.get("sidebarCollapsed").and_then(Value::as_bool) {
                    self.store.state.settings.sidebar_collapsed = collapsed;
                }
                self.send_state();
                self.save();
                Ok(Value::Null)
            }
            "layout" => {
                let x = args.get("x").and_then(Value::as_f64).unwrap_or(0.0);
                let y = args.get("y").and_then(Value::as_f64).unwrap_or(0.0);
                let width = args.get("width").and_then(Value::as_f64).unwrap_or(1.0).max(1.0);
                let height = args.get("height").and_then(Value::as_f64).unwrap_or(1.0).max(1.0);
                let bounds = Rect {
                    position: LogicalPosition::new(x, y).into(),
                    size: WryLogicalSize::new(width, height).into(),
                };
                self.content = Some(bounds);
                let active = self.store.state.active_tab.clone();
                self.ensure_view(&active);
                for view in self.views.values() {
                    let _ = view.set_bounds(bounds);
                }
                self.sync_visibility();
                Ok(Value::Null)
            }
            "overlay" => {
                self.overlay = args.get("open").and_then(Value::as_bool).unwrap_or(false);
                self.sync_visibility();
                Ok(Value::Null)
            }
            "history.clear" => {
                self.store.state.history.clear();
                self.send_state();
                self.save();
                Ok(Value::Null)
            }
            "notes.list" => {
                self.send_notes();
                Ok(Value::Null)
            }
            "notes.read" => match arg("id").and_then(|id| self.notes.read(&id)) {
                Some(body) => Ok(json!({ "body": body })),
                None => Err("note introuvable".into()),
            },
            "notes.save" => {
                let id = arg("id");
                let title = arg("title").unwrap_or_else(|| "Note".into());
                let body = arg("body").unwrap_or_default();
                match self.notes.write(id.as_deref(), &title, &body) {
                    Some(id) => {
                        self.send_notes();
                        Ok(json!({ "id": id }))
                    }
                    None => Err("enregistrement impossible".into()),
                }
            }
            "notes.remove" => {
                if let Some(id) = arg("id") {
                    self.notes.remove(&id);
                    self.send_notes();
                }
                Ok(Value::Null)
            }
            "app.focusAddress" => Ok(Value::Null),
            other => Err(format!("commande inconnue : {other}")),
        };
        self.respond(id, result);
    }

    fn on_title(&mut self, tab_id: &str, title: String) {
        if let Some(tab) = self.store.state.tab_mut(tab_id) {
            tab.title = if title.trim().is_empty() {
                model::title_for(&tab.url)
            } else {
                title.trim().to_string()
            };
            let url = tab.url.clone();
            let label = tab.title.clone();
            self.store.state.rename_visit(&url, &label);
        }
        self.send_state();
        self.save();
    }

    fn on_load(&mut self, tab_id: &str, event: PageLoadEvent, load_url: String) {
        let current = self
            .views
            .get(tab_id)
            .and_then(|view| view.url().ok())
            .filter(|url| !url.is_empty() && url != "about:blank")
            .unwrap_or(load_url);
        let finished = matches!(event, PageLoadEvent::Finished);
        let mut visit = None;
        if let Some(tab) = self.store.state.tab_mut(tab_id) {
            match event {
                PageLoadEvent::Started => {
                    tab.loading = true;
                }
                PageLoadEvent::Finished => {
                    tab.loading = false;
                    if !current.is_empty() && !current.starts_with("about:") {
                        let record = tab.origin == NavOrigin::User;
                        tab.origin = NavOrigin::User;
                        tab.set_url(&current, record);
                        visit = Some((tab.url.clone(), tab.title.clone()));
                    }
                }
            }
        }
        if let Some((url, title)) = visit {
            self.store.state.record_visit(&url, &title);
        }
        if self.smoke && finished && current.contains("vela-selftest") {
            let tab = self.store.state.tab(tab_id);
            eprintln!(
                "SMOKE page-loaded url={} title={}",
                tab.map(|tab| tab.url.clone()).unwrap_or_default(),
                tab.map(|tab| tab.title.clone()).unwrap_or_default()
            );
            self.save();
            eprintln!("SMOKE PASS chrome, ipc, webview, navigation");
            std::process::exit(0);
        }
        self.send_state();
        self.save();
    }

    fn smoke_start(&mut self) {
        eprintln!("SMOKE chrome-and-ipc-ready");
        let tab = self.store.state.active_tab.clone();
        if let Some(url) = smoke_url() {
            let _ = self.navigate(&tab, &url);
        }
    }

    fn on_new_tab(&mut self, opener: &str, url: String) {
        let space = self
            .store
            .state
            .tab(opener)
            .map(|tab| tab.space_id.clone())
            .unwrap_or_else(|| self.store.state.active_space.clone());
        let _ = self.create_tab(Some(&space), Some(&url));
    }

    fn shutdown(&mut self) {
        self.save();
    }
}

fn configure_tab_view<'a>(
    builder: WebViewBuilder<'a>,
    proxy: EventLoopProxy<UserEvent>,
    tab: &Tab,
    bounds: Rect,
) -> WebViewBuilder<'a> {
    let title_proxy = proxy.clone();
    let load_proxy = proxy.clone();
    let popup_proxy = proxy.clone();
    let title_id = tab.id.clone();
    let load_id = tab.id.clone();
    let popup_id = tab.id.clone();

    builder
        .with_bounds(bounds)
        .with_url(tab.url.clone())
        .with_devtools(cfg!(debug_assertions))
        .with_navigation_handler(|url: String| {
            url.starts_with("http://")
                || url.starts_with("https://")
                || url.starts_with("file://")
                || url == "about:blank"
        })
        .with_document_title_changed_handler(move |title: String| {
            let _ = title_proxy.send_event(UserEvent::TabTitle(title_id.clone(), title));
        })
        .with_on_page_load_handler(move |event: PageLoadEvent, url: String| {
            let _ = load_proxy.send_event(UserEvent::TabLoad(load_id.clone(), event, url));
        })
        .with_new_window_req_handler(move |url: String, _features| {
            let _ = popup_proxy.send_event(UserEvent::NewTab(popup_id.clone(), url));
            NewWindowResponse::Deny
        })
}

fn smoke_url() -> Option<String> {
    let path = std::env::temp_dir().join("vela-selftest.html");
    url::Url::from_file_path(path).ok().map(|url| url.to_string())
}

fn data_dir() -> PathBuf {
    if let Some(dirs) = directories::BaseDirs::new() {
        dirs.data_dir().join("Vela Native")
    } else {
        std::env::temp_dir().join("vela-native")
    }
}

fn serve_asset(request: &Request<Vec<u8>>) -> Response<std::borrow::Cow<'static, [u8]>> {
    let path = url::Url::parse(&request.uri().to_string())
        .map(|url| url.path().to_string())
        .unwrap_or_else(|_| "/index.html".into());
    let name = match path.as_str() {
        "/" | "/index.html" => "index.html",
        "/styles.css" => "styles.css",
        "/app.js" => "app.js",
        _ => return not_found(),
    };
    let (body, mime): (&'static [u8], &'static str) = match name {
        "index.html" => (CHROME_HTML.as_bytes(), "text/html; charset=utf-8"),
        "styles.css" => (CHROME_CSS.as_bytes(), "text/css; charset=utf-8"),
        _ => (CHROME_JS.as_bytes(), "text/javascript; charset=utf-8"),
    };
    Response::builder()
        .header(CONTENT_TYPE, mime)
        .header("Cache-Control", "no-store")
        .body(std::borrow::Cow::Borrowed(body))
        .expect("réponse")
}

fn not_found() -> Response<std::borrow::Cow<'static, [u8]>> {
    Response::builder()
        .status(404)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(std::borrow::Cow::Borrowed(&b"introuvable"[..]))
        .expect("réponse")
}

#[cfg(target_os = "windows")]
fn hex(bytes: &[u8; 16]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn main() {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let window = WindowBuilder::new()
        .with_title("Vela")
        .with_inner_size(LogicalSize::new(1320.0, 860.0))
        .with_min_inner_size(LogicalSize::new(880.0, 600.0))
        .build(&event_loop)
        .expect("fenêtre impossible à créer");
    window.set_focus();

    let proxy = event_loop.create_proxy();
    let resize_proxy = proxy.clone();

    if std::env::args().any(|arg| arg == "--selftest") {
        let fixture = std::env::temp_dir().join("vela-selftest.html");
        let _ = std::fs::write(
            &fixture,
            "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">\
             <title>Vela selftest</title></head><body><h1>Selftest</h1>\
             <p>WKWebView / WebView2</p></body></html>",
        );
        eprintln!("SMOKE fixture={}", fixture.display());
        let timeout_proxy = event_loop.create_proxy();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(25));
            let _ = timeout_proxy.send_event(UserEvent::Timeout);
        });
    }

    let mut app = App::new(window, proxy);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                app.shutdown();
                *control_flow = ControlFlow::Exit;
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(_),
                ..
            } => {
                let _ = resize_proxy.send_event(UserEvent::Resize);
            }
            Event::UserEvent(UserEvent::Ipc(body)) => app.on_ipc(&body),
            Event::UserEvent(UserEvent::TabTitle(tab, title)) => app.on_title(&tab, title),
            Event::UserEvent(UserEvent::TabLoad(tab, event, url)) => app.on_load(&tab, event, url),
            Event::UserEvent(UserEvent::NewTab(opener, url)) => app.on_new_tab(&opener, url),
            Event::UserEvent(UserEvent::Resize) => {
                let size = app.window.inner_size();
                app.emit(json!({
                    "type": "window",
                    "data": { "width": size.width, "height": size.height }
                }));
            }
            Event::UserEvent(UserEvent::Timeout) => {
                if app.smoke {
                    eprintln!("SMOKE FAIL timeout — la page n’a jamais signalé son chargement");
                    std::process::exit(1);
                }
            }
            _ => {}
        }
    });
}

