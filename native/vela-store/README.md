# vela-store — spike mesuré (JSON de `vela.json`)

Portage Rust de la lecture/écriture de `vela.json`, l'équivalent de
`JSON.parse` / `JSON.stringify` dans `src/main/store.ts`.

**Verdict : ne pas brancher.** Rust est **≈4,5× plus lent** à lire et **≈6,5×
plus lent** à écrire que V8, et même `serde_json` seul — sans traverser la
frontière N-API — reste **≈1,7× plus lent** que le couple `JSON.parse` +
`JSON.stringify`.
Contrairement à l'hypothèse de départ, un module plus *lourd* n'aide pas Rust :
la conversion d'objet est proportionnelle au nombre de nœuds, et V8 fait le
même travail dans le processus, sans frontière.

## Ce que la crate expose

| Export | Équivalent TS | Rôle |
|---|---|---|
| `parse(text)` | `JSON.parse` | texte → objet JS |
| `stringify(value)` | `JSON.stringify` | objet JS → texte |
| `roundTrip(text)` | `JSON.stringify(JSON.parse(text))` | texte → texte, sans conversion d'objet : isole `serde_json` |
| `nodeCount(text)` | — | nombre de nœuds, pour ramener les mesures au coût unitaire |

`stringify` normalise les flottants entiers en `i64` avant sérialisation :
la conversion N-API perd le type entier au-delà de `i32`, donc un horodatage
`1763000000000` arriverait en `f64` et serde l'écrirait `1763000000000.0`.
Sans cette passe, le fichier écrit ne serait pas identique à celui de V8.

## Mesures

MacBook Apple silicon, Node 22.14, build `--release` (opt-level 3, LTO),
médiane de 15 passes après 3 échauffements, corpus dérivé du vrai `vela.json`
gonflé en dupliquant ses propres entrées.

| Charge | `parse` V8 | `parse` Rust | Rapport | `stringify` V8 | `stringify` Rust | Rapport | A/R V8 | A/R Rust | Rapport |
|---|---|---|---|---|---|---|---|---|---|
| 25 Ko (fichier réel) | 30 µs | 147 µs | 5,0× | 31 µs | 200 µs | 6,5× | 63 µs | 95 µs | 1,5× |
| 400 Ko | 475 µs | 2,03 ms | 4,3× | 422 µs | 2,68 ms | 6,4× | 862 µs | 1,47 ms | 1,7× |
| 1,2 Mo | 1,32 ms | 6,14 ms | 4,7× | 1,22 ms | 8,20 ms | 6,7× | 2,54 ms | 4,42 ms | 1,7× |
| 3 Mo | 3,67 ms | 16,29 ms | 4,4× | 3,18 ms | 21,41 ms | 6,7× | 6,89 ms | 11,95 ms | 1,7× |

Coût par nœud à 3 Mo (73 604 nœuds), décomposé :

| Étape | Coût | Rapport à `JSON.parse` |
|---|---|---|
| `JSON.parse` V8, tout compris | **50 ns** | 1× |
| `serde_json` seul, sans frontière | **108 ns** | 2,2× |
| conversion de l'arbre vers un objet JS | **114 ns** | 2,3× |
| parse natif complet | **221 ns** | 4,4× |

La lecture du fichier s'ajoute aux deux côtés et ne change rien. Autrement dit :
la conversion seule — avant même de compter l'analyse — coûte déjà plus du
double du prix total de `JSON.parse`, et un analyseur Rust infiniment rapide
laisserait quand même l'appel natif deux fois plus lent que V8.

## Ce que ça coûterait dans l'application

L'état réel fait 25 Ko (≈ 0,03 ms à lire). Au plafond de l'application — 2 000
entrées d'historique, 500 favoris, une poignée d'onglets — on est autour de
400 Ko : **0,42 ms en V8 contre 2,68 ms en Rust** à chaque écriture. Les
écritures étant groupées à 800 ms d'intervalle, ce serait 2,3 ms pris au
processus principal, dans le sens de la régression.

La lecture, elle, ne pèse qu'une fois au démarrage : 147 µs au lieu de 30 µs.
Invisible. C'est l'écriture qui décide, et elle perd.

## Parité

`node scripts/parity-store.mjs` compare les deux implémentations sur 15 cas
plus le vrai `vela.json`, en exigeant l'égalité profonde **et** l'ordre des
clés en lecture, et l'égalité octet pour octet en écriture.

Concordent : objet plat, tableaux imbriqués, unicode (accents, émojis),
échappements (`\u2028`, sauts de ligne), entiers, flottants (dont 1e-7, 1e21),
`-0`, clés numériques, booléens et `null`, imbrication profonde, et le fichier
réel — lecture et écriture identiques.

Écarts connus, à garder en tête si la crate était réutilisée ailleurs :

| Cas | JavaScript | Rust | Portée |
|---|---|---|---|
| Entier > 2⁵³ | arrondi au double | renvoyé en chaîne par napi | aucun champ de Vela n'y touche |
| `\ud800` isolé dans le JSON | accepté | erreur de parse | fichier corrompu uniquement |
| `undefined` dans un tableau | écrit `null` | lève | l'état n'a pas de trous de tableau |
| `Date`, objets à `toJSON` | `toJSON()` appelé | donnée brute | l'état ne stocke que des nombres |
| `NaN`, `Infinity` | écrit `null` | lève | impossible en JSON |

`undefined` en propriété d'objet, lui, est bien **omis** des deux côtés — le
cas des `favicon?: string | undefined` de l'état est donc couvert.

## Reproduire

```sh
node scripts/build-store.cjs        # ou npm run native:store
node scripts/parity-store.mjs       # 0 si la parité tient
node scripts/bench-store.mjs        # tableau ci-dessus
```

Sans le binaire, les deux scripts échouent au `require` — c'est voulu : il n'y
a pas de repli TypeScript ici, puisque rien n'appelle la crate.

## Si un jour ça change

Le branchement tiendrait en trois lignes dans `src/main/store.ts` :
`storeParse` au constructeur à la place de `JSON.parse`, et `storeStringify`
dans `payload()`. À ne faire qu'avec une mesure contraire, et après avoir
coché que `payload()` reste identique octet pour octet (le magasin compare les
charges pour éviter de réécrire un fichier inchangé).
