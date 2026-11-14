# vela-blocklist — filtre de traqueurs en Rust (NAPI)

Port Rust de `src/main/blocklist.ts`. Les listes (`src/hosts.rs`) sont générées
depuis le TS par `scripts/gen-blocklist-rs.cjs` : la source de vérité reste le
TypeScript, et la CI refuse désormais une liste Rust qui aurait dérivé (job
`checks`).

Le filtre est **livré** : `electron-builder.yml` copie le binaire dans
`resources/native/vela-blocklist/vela-blocklist.node`, et
`src/main/blocklistNative.ts` le charge une fois au démarrage. Sans binaire, le
comportement est identique (repli TypeScript) — même logique, mêmes listes.

## Construire

Le fichier consommé par Electron s'appelle toujours `vela-blocklist.node` :
l'extension seule compte, le contenu est la bibliothèque dynamique de la
plateforme.

**macOS — binaire universel (ce que la release livre)**

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cd native/vela-blocklist
cargo build --release --target aarch64-apple-darwin
cargo build --release --target x86_64-apple-darwin
lipo -create \
  target/aarch64-apple-darwin/release/libvela_blocklist.dylib \
  target/x86_64-apple-darwin/release/libvela_blocklist.dylib \
  -output vela-blocklist.node
lipo -archs vela-blocklist.node      # x86_64 arm64
```

Un seul fichier universel est volontaire : `@electron/universal` refuse de
fusionner deux bundles dont un fichier diffère (il ne sait pas réconcilier un
binaire présent d'un seul côté), et deux `.node` séparés par architecture ne se
réconcilient pas non plus. `lipo` règle le problème en amont — même fichier des
deux côtés, chaque tranche se charge selon l'architecture du processus hôte.

**Linux**

```bash
cargo build --release
cp target/release/libvela_blocklist.so vela-blocklist.node
```

**Windows**

```bash
cargo build --release
cp target/release/vela_blocklist.dll vela-blocklist.node
```

`npm run native:build` régénère les listes puis compile pour l'architecture de
la machine (recette macOS de développement) ; il ne produit pas l'universel.

Le `.dylib` copié en `.node` est exactement ce que fait `@napi-rs/cli` :
Node/Electron le charge via `require()`.

## Tests

```bash
cargo test --release
```

Quatre tests : traqueurs connus, sites ordinaires, pages d'authentification,
niveaux de filtrage.

## Livraison (CI)

| Job | Ce qu'il fait |
|---|---|
| `checks` | `cargo test --release`, régénère `hosts.rs` et échoue si le fichier diffère de celui du dépôt |
| `build-mac` | compile les deux architectures puis `lipo` un `.node` universel |
| `build-win` | compile `vela_blocklist.dll` et le copie en `.node` |
| `build-linux` | compile `libvela_blocklist.so` et le copie en `.node` |

Le binaire n'est jamais versionné (`native/**/*.node` est ignoré) : il est
produit avant le packaging, dans le même job.

## Charger dans Electron

`src/main/blocklistNative.ts` essaie le chemin de développement (la crate à la
racine du dépôt), puis `process.resourcesPath` pour l'application empaquetée. Si
aucun ne charge, l'application continue avec le TypeScript et — en version
empaquetée — l'écrit dans `vela-errors.log` (`filtre natif absent`) : c'est le
seul moyen de savoir si Rust tourne réellement chez un utilisateur.

## Mesurer

```bash
node scripts/bench-blocklist.mjs native/vela-blocklist/vela-blocklist.node
node scripts/bench-blocklist.mjs /tmp/blocklist-ts.mjs   # TS compilé par esbuild
```
