# Vela → Rust : état, carte de portage et portes de sortie

Constat établi le 14 novembre 2026 sur la version **0.3.37**. Les chiffres sont
mesurés dans l'arbre, pas estimés. Ce document remplace la section « Rust » de
`maquette/refonte-zero-vela.html`, qui reste la maquette visuelle d'origine.

## 1. Ce qui tourne en Rust aujourd'hui

| Module | État | Preuve |
|---|---|---|
| `native/vela-blocklist` | **Livré** : copié par `extraResources`, chargé au démarrage, repli TypeScript si absent | `cargo test --release` (4 tests), `lipo -archs` → `x86_64 arm64` |
| `native/vela-store` | **Mesuré, non branché** : Rust ≈4,5× plus lent à lire et ≈6,5× plus lent à écrire `vela.json` que V8 | `native/vela-store/README.md` |

Depuis ce lot, la CI teste la crate et refuse qu'une liste Rust dérive du
TypeScript ; un binaire absent au packaging est journalisé au démarrage
(`vela-errors.log`, `filtre natif absent`). Avant, la phase 1 existait dans le
dépôt mais ne partait **jamais** dans l'application.

## 2. Le point dur : ce n'est pas JavaScript, c'est Chromium

Vela est un navigateur, pas une app qui affiche des pages. Ce qui fait le
produit est dans Chromium :

- un `WebContentsView` par onglet (`src/main/tabs.ts`, 1 401 l.) ;
- une partition par espace, cookies et cache isolés (`session.fromPartition`) ;
- l'identité Chrome : UA, client hints, `window.chrome`, override CDP
  (`src/main/identity.ts`, 184 l.) ;
- le blocage par `webRequest.onBeforeRequest` (`src/main/privacy.ts`) ;
- `capturePage` pour les vignettes, impression/PDF natifs.

Aucune de ces briques n'existe dans WebKit ni dans Servo.

| Voie | Chromium | Fidélité Vela | Coût |
|---|---|---|---|
| Tauri 2 / wry | Non (WKWebView, WebKitGTK, WebView2) | ✕ espaces, UA, blocage par session, vues natives perdus | 3 moteurs à couvrir |
| Rust + CEF (`cef-rs`, Tauri CEF 3 alpha) | Oui | ◐ fidèle, mais coque de vues à réécrire | plusieurs mois, bindings alpha |
| Servo / Verso | Non | ✕ compatibilité web insuffisante | — |
| **Rust dans Electron** | **Oui** | **✓ 100 %** | jours, mesurable |

## 3. Carte de portage (lignes réelles)

| Fichier | Lignes | Verdict |
|---|---|---|
| `src/shared/**` (hors tests) | 9 428 | **Inchangé** — pur TS, aucune API Electron, 5 124 l. de tests |
| `src/renderer/**` | 28 659 TSX + 77 feuilles | **Inchangé** — ne connaît que `window.vela` |
| `src/main/notes.ts` | 657 | Port direct (fs + Markdown) |
| `src/main/avatars.ts`, `bookmarks.ts`, `integrity.ts`, `letterboxd.ts`, `noteAudio.ts`, `blocklist.ts` | ≈ 1 400 | Port direct |
| `src/main/store.ts` | 1 139 | Port possible, **mais perdant mesuré** |
| `src/main/tunnel.ts` | 977 | Port direct (fetch + extraction HTML), gain réel |
| `src/main/agent.ts` | 753 | Port direct (SSE), `dialog` à isoler |
| `src/main/browser.ts` | 1 815 | **Réécriture partielle** : orchestration mêlée au moteur |
| `src/main/tabs.ts` | 1 401 | **Réécriture contre CEF** (vues, layout, raccourcis, menus) |
| `src/main/peek.ts` | 468 | Réécriture (vues natives) |
| `src/main/pageDriver.ts` | 491 | Réécriture (`executeJavaScript` → CDP) |
| `src/main/comic.ts` | 582 | Réécriture (`net`, session, `ipcMain`) |
| `src/main/updater.ts` | 783 | Réécriture partielle : la vérification (SHA-512, Ed25519) est déjà maison |
| `src/main/identity.ts`, `privacy.ts`, `thumbnails.ts`, `favicons.ts` | 608 | Réécriture (API moteur) |
| `src/main/menu.ts`, `index.ts`, `ipc/**` | ≈ 1 440 | Réécriture (cycle de vie, menu, tray, pont) |

Total coque à réécrire : **≈ 8 800 lignes**, plus le pont.

## 4. Le vrai chantier préalable : le contrat IPC

Mesuré : **≈ 190 canaux**, **123** `handle()`, **190** appels `window.vela` dans
**45** fichiers. Côté main, les charges arrivent en `unknown` et sont validées à
la main (`asString`, `asId`, casts). En Electron c'est supportable ; dans une
coque Rust, chaque canal devient une frontière de sérialisation à réécrire à la
main.

Ordre proposé :

1. **Registre déclaratif unique** : nom, schéma d'entrée, schéma de sortie,
   émetteur autorisé. `src/main/ipc/ipcPolicy.ts` fait déjà la moitié du travail
   (classification coque / page / inconnu) — c'est la base.
2. **Validation runtime + types générés** pour le renderer (`ts-rs` ou
   équivalent), à la place des 123 handlers ad hoc.
3. **Transport remplaçable** : IPC Electron aujourd'hui, pipe ou socket JSON
   demain, sans toucher au renderer.

Critère de sortie : plus aucun handler qui caste une charge sans passer par le
schéma. Tant que ce n'est pas fait, un portage Rust réécrit 190 contrats
implicites.

**État : lot 1 clos — 137 canaux, 9 points d'entrée.** `src/main/ipc/contract.ts` porte
les champs, les contrats et la liaison. Sont passés en contrats, avec exactement
les mêmes noms de canal qu'avant — `ipcBridge.test.ts` compare les canaux
appelés par le preload à ceux réellement enregistrés, donc un nom perdu casse la
suite :

| Fichier | Canaux | Dont événements |
|---|---|---|
| `ipc/app.ts` | 41 | 2 |
| `ipc/tabs.ts` | 31 | 2 |
| `ipc/notes.ts` (notes + tâches) | 22 | 1 |
| `ipc/library.ts` (marque-pages + historique) | 13 | 0 |
| `ipc/tunnel.ts` | 10 | 1 |
| `ipc/spaces.ts` (espaces + Letterboxd) | 7 | 0 |
| `ipc/agent.ts` (agent + atelier) | 5 | 1 |
| `ipc/privacy.ts` | 1 | 0 |
| `comic.ts` (passerelle BD) | 7 | 0 |

Règle suivie partout : une charge **mal formée** est ignorée (elle ne peut pas
décrire le canal) ; une erreur **métier** — titre de tâche vide, requête de
tunnel vide — lève toujours, comme avant. Les deux cas sont vérifiés dans l'app
réelle, pas seulement au typecheck : `spaces.activate("")` rend `undefined` sans
lever, `tasks.create({ title: "  " })` rejette avec « Titre de tâche vide. »

Ces essais lancent `out/` : il faut `npm run build` **avant**, sinon on vérifie
le build précédent.

Aucun cast de charge ne subsiste sur le chemin IPC : `asId`, `asString` et les
`(payload ?? {}) as …` ont disparu. Les seuls `as` restants de `src/main/ipc`
sont dans `contract.ts` — à l'endroit exact où une valeur validée redevient
typée — et dans `util.ts`, après un prédicat.

La passerelle BD (`comic.ts`) est passée au même contrat. Elle garde ce qui lui
est propre : sa politique d'émetteur, son jeton de session par onglet et sa
table d'accords distants. Ce sont ses charges qui ne sont plus devinées.

## 5. Portes de sortie d'un spike CEF

Le spike doit égaler la 0.3.37, pas « faire mieux » :

| Mesure | Référence 0.3.37 |
|---|---|
| Interface prête | 444 ms (mesure instrumentée, `docs/AUDIT.md`) |
| RAM au repos | 232 Mo |
| Vues vivantes | 7 sur 16 Go, 6 sur 8 Go, 5 en dessous ; filet à 1,4 Go |
| Partitions | une par espace, cookies et cache séparés |
| Identité | UA + client hints + `navigator.userAgentData` alignés |
| Blocage | même filtre, mêmes compteurs par onglet |
| Fonctions système | impression/PDF, vignettes, menu, tray, raccourci global, mises à jour signées |

Si une seule ligne échoue, on reste en « Rust dans Electron » : c'est déjà un
Vela dont le cœur est en Rust, sans changer de moteur.

## 6. Ce que Rust ne donnera pas

- **Pas de gain d'affichage** : le rendu est celui de Chromium dans les deux cas.
- **Pas de gain de taille** : le DMG fait ~120 Mo, dont l'essentiel est Chromium.
- **Pas de gain sur le store** : mesure contraire, documentée dans
  `native/vela-store/README.md` (aller-retour JSON plus lent qu'en V8, et même
  `serde_json` seul reste 1,7× plus lent).

Les gains réels sont : binaire sans Node, démarrage, sécurité mémoire du cœur
(tunnel, notes, agent), et testabilité hors Electron.

## 7. Ordre d'exécution recommandé

1. ✅ **Phase 1 livrée** (ce lot) : filtre natif réellement packagé, testé en CI,
   parité des listes gardée, diagnostic au démarrage.
2. **Normaliser le pont IPC** (§4) — sert dans tous les scénarios, y compris
   sans migration.
3. **Porter les modules perdants zéro** : notes, tunnel, avatars, marque-pages,
   intégrité — mesurés avant/après avec `scripts/bench-*.mjs`.
4. **Spike CEF** (2 semaines, un onglet + une partition), contre les portes §5.
5. Décider CEF sur les chiffres, sinon rester en phase 1+2.
