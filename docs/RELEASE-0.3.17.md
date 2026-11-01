# Vela 0.3.17 — notes de version et checklist

Préparé le 1er novembre 2026. La publication démarre à la poussée sur `main` d'un commit dont
`package.json` annonce une version encore sans release (`.github/workflows/release.yml`) : le
workflow construit les trois plateformes et crée `v0.3.17`.

État de la préparation :

| Élément | État |
|---|---|
| Version `package.json` | **0.3.17** |
| Version `package-lock.json` | **0.3.17** (racine et `packages[""]`) |
| Notes de version | rédigées ci-dessous, publiées dans la release |
| Checklist plateformes | ci-dessous ; builds assurés par le workflow, pas par cette machine |
| Release GitHub | **à créer** par la poussée |
| Site | **encore 0.3.16** — retard d'une version autorisé, alignement après les empreintes |
| Signature / notarisation | **aucune** — pas de certificat dans ce dépôt, donc pas de mise à jour macOS automatique |

## Notes de version

> Vela 0.3.17 — les blocages de l'audit corrigés, et une interface qui se tient sous la souris.

### Ergonomie

- **Notes et agent ne s'écrasent plus.** Ils s'excluent dans le store ; sous 1180 px, le panneau ancré
  se resserre à 340 px au lieu de comprimer la page.
- **Plus de frappe perdue.** L'enregistrement différé d'une note passe par `persistDraft`, vidé avant
  d'ouvrir une autre note, d'en créer une ou de revenir à la liste ; une version de brouillon empêche
  un enregistrement tardif d'écraser la note suivante.
- **Les feuilles prennent et retiennent le focus.** `useModalFocus` place le focus dans la feuille,
  y garde Tab et Shift+Tab, et le rend au déclencheur ; `aria-modal="true"` partout.
- **Actions d'onglet visibles au clavier** (`:focus-within`), cibles portées de 20 à 24 px.
- **Un seul aperçu d'onglet** : plus d'infobulle native en double, une vignette réelle quand le cache
  en a une, sinon aucune image — et une seule ligne d'adresse.
- **Palette classée** : titre exact, préfixe, mot, sous-chaîne, indice ; les groupes se suivent selon
  leur meilleur résultat, et la commande d'une note ouvre cette note.
- **Zoom affiché** dans la barre d'état (« 110 % »), cliquable pour revenir à 100 %.
- **Navigation au clavier** : ⌃Tab, ⌃⇧Tab, ⌃Page↑↓, ⌘⇧[ et ⌘⇧] ; « Onglet suivant / précédent » au
  menu Fenêtre.
- **Menus contextuels** : huit entrées sur un onglet, ouverts aussi par la touche Menu ou ⇧F10, avec
  flèches et Échap ; le menu de page ne reste plus vide sur une image.

### Mouvement

- **Une seule échelle** : 24 durées entre 80 et 540 ms ramenées à **5 pas** (120, 160, 220, 320,
  480 ms), 6 courbes écrites à la main ramenées à **5 courbes nommées** ; l'écart maximal de
  recalage est de 30 ms.
- **Des sorties qui se voient** : fond des panneaux effacé en 220 ms, tiroir de notes et panneau
  agent en fondu + glissement de 18 px, toasts en 160 ms — sans image vide au milieu.
- **Un toast redevenu lisible** : il héritait d'une couleur de texte pour un fond qui avait changé.

### Performances, mesurées

| Scénario | Avant | Après |
| --- | --- | --- |
| Survol des tuiles d'accueil, 5,8 s | 1 365,7 ms de fil principal, 866,5 ms de recalcul de style | **717,1 ms** (−47 %), **241,6 ms** (−72 %) |
| Glissement de la vue scindée | 190,2 ms de fil principal, 50,8 ms de script | **116,1 ms** (−39 %), **15,6 ms** (−69 %) |
| Nœuds floutés à l'accueil | 9 | **4** (le flou ne changeait l'image que de 13/255 au plus) |
| Six cycles ouverture/fermeture de panneau | 931 ms | 948 ms (+1,8 %, ≈ 3 ms par fondu) |

### Vocabulaire

Un nom par objet : **Brief** (plus « Reprendre le fil » ni « Brief du jour »), **Atelier** (plus
« Travail » pour le mode de recherche), **Rapports** (plus « Travaux » pour les productions de
l'agent). Les doublons de l'accueil partent : plus de second « Personnaliser » en pied de page, plus
de puce « Reprendre ».

### Sous le capot

- `styles.css` (16 461 lignes) devient **21 feuilles** dans `src/renderer/src/styles/`, découpées dans
  l'ordre du fichier pour ne pas déplacer la cascade ; `SettingsPanel` passe de 1 471 à 1 081 lignes
  avec `AppearancePage` (345) et `AboutPage` (98) extraites.
- **123 règles sans producteur** retirées : 2 244 → 2 121 règles, −15 172 octets sur les feuilles
  (−4,7 %), −4,1 % une fois compressées.
- Preuve des deux changements : **14 écrans photographiés, 0 pixel de différence**, empreinte de
  géométrie identique.
- Menu natif : **25 accélérateurs en `CmdOrCtrl`**, déclarés mais non enregistrés (la frappe est
  interceptée dans `TabManager`), jeu identique sur macOS, Windows et Linux ; « Réglages… » apparaît
  sous **Fichier** hors macOS ; `shortcut()` rend `Ctrl+Shift+T` là où il rendait `Ctrl+⇧T`.
- 39 fichiers de tests, **399 tests**, types et build verts.

### Site

La page d'aide annonce les raccourcis réels (27 lignes : les 26 de la page Raccourcis plus ⌘⌥ + clic),
dit que ⇧ devient Maj hors macOS, et le mode de recherche s'appelle **Atelier** sur l'accueil, la page
navigateur (chapitre et ancre `#atelier`) et la confidentialité.

## Checklist des plateformes

### 0. Avant tout (local)

| # | Étape | Commande | Attendu |
|---|---|---|---|
| 1 | Types | `npm run typecheck` | code 0 |
| 2 | Tests | `npm test` | 39 fichiers, 399 tests |
| 3 | Build | `npm run build` | code 0, `out/` produit |
| 4 | Dépendances | `npm audit` | 2 critiques + 16 modérées, **toutes dans la chaîne de test et de build** (Vitest, electron-builder) |
| 5 | Version | `node -p "require('./package.json').version"` | `0.3.17` |
| 6 | Secrets | `git status --short` | aucun `.env`, aucun certificat, aucun profil Electron |

### 1. macOS (arm64 + x64 + universel)

| # | Étape | Commande ou moyen | Attendu |
|---|---|---|---|
| 1 | Build | workflow `Release` | `release/mac/` avec trois `.dmg` et trois `.zip` |
| 2 | Universalité | `lipo -archs …/mac-universal/Vela.app/Contents/MacOS/Vela` | `x86_64 arm64` (vérifié par le workflow) |
| 3 | Manifeste | `node scripts/verify-mac-update.cjs release/mac/latest-mac.yml` | trois entrées, choisies par architecture |
| 4 | Signature | `codesign -dv --verbose=4 …` | ad hoc tant qu'aucun secret `APPLE_*` n'existe |
| 5 | Identité | Ouvrir l'app, menu Vela, À propos | « Vela », version 0.3.17 |
| 6 | Mise à jour | Depuis 0.3.16 installée | **impossible sans Developer ID** : le .dmg reste la voie documentée |

### 2. Windows (x64, NSIS)

| # | Étape | Commande ou moyen | Attendu |
|---|---|---|---|
| 1 | Build | workflow | `Vela-0.3.17-x64.exe` |
| 2 | Menu | Alt dans l'application | les 25 raccourcis **s'affichent** en `Ctrl+…`, et « Réglages… » sous Fichier |
| 3 | Page Raccourcis | Réglages → Raccourcis | `Ctrl+K`, `Ctrl+Shift+T`, aucun glyphe ⌘ |
| 4 | Signature | Propriétés du fichier | aucune : SmartScreen avertit, à écrire dans la release |

### 3. Linux (AppImage + deb)

| # | Étape | Commande ou moyen | Attendu |
|---|---|---|---|
| 1 | Build | workflow | `Vela-0.3.17-x86_64.AppImage`, `Vela-0.3.17-amd64.deb` |
| 2 | AppImage | `chmod +x` puis lancement | démarrage, icône, nom dans le dock |
| 3 | deb | `sudo apt install ./Vela-0.3.17-amd64.deb` | entrée de menu, catégorie Réseau |

### 4. Après la publication

| # | Étape | Commande | Attendu |
|---|---|---|---|
| 1 | Release | `gh release view v0.3.17` | titre, notes, 9 installateurs, manifestes `latest*.yml` |
| 2 | Empreintes | `shasum -a 256` sur les six fichiers annoncés | reportées sur le site |
| 3 | Liens | `curl -I` sur les URL `releases/download/v0.3.17/…` | 200 |
| 4 | Manifeste | `curl -sL …/v0.3.17/latest-mac.yml` | version 0.3.17, trois entrées |

### 5. Mise à jour du site (seulement après l'étape 4)

| # | Fichier | À changer |
|---|---|---|
| 1 | `site/public/index.html` | `softwareVersion`, `downloadUrl`, surtitre, titre de la section téléchargement, six URL et six empreintes |
| 2 | `site/public/nouveautes/index.html` | entrée 0.3.17 en tête, « Version courante », pied de page |
| 3 | `site/public/aide/index.html` | noms de fichiers `Vela-0.3.17-…` |
| 4 | `site/public/navigateur/index.html`, `confidentialite/index.html`, `site/public/404.html` | pied de page « Version 0.3.17 » |
| 5 | `site/public/site.js`, `site/og/og.html` | version des liens de téléchargement, surtitre du visuel de partage |
| 6 | Tests | `npx vitest run src/shared/site.test.ts src/shared/docs.test.ts` | verts |

Le site peut rester une version en retard, jamais en avance : les tests le vérifient.

## Ce que la 0.3.17 ne contient pas

- **Les captures du site sont antérieures à la refonte** : l'accueil de `site/public/captures/` montre
  encore « BRIEF DU JOUR » et les deux « Personnaliser » que cette version retire. Les textes
  alternatifs qui les décrivent sont dans le même retard.
- Aucune machine Windows ni Linux n'a servi à vérifier la barre de menus : la preuve est le gabarit
  rendu par Electron et les tests de chaînes, pas une capture du système.
- Ni signature Developer ID, ni signature Windows, ni notarisation : la mise à jour macOS automatique
  reste inactive et SmartScreen avertit au premier lancement.
- Les 2 avis critiques et 16 modérés de `npm audit` restent dans la chaîne de développement (Vitest,
  electron-builder) : aucune dépendance d'exécution n'est concernée.
- Pas de mesure sous charge (build de production avec une page lourde ouverte).

## Garde-fous

- Ne pas créer de tag à la main : le workflow s'en charge, et un tag orphelin bloquerait la release
  suivante.
- Ne pas utiliser `scripts/upload-release.sh` : il pointe encore sur la v0.1.0 et les anciens noms de
  fichiers.
- Ne pas modifier le site avant que les six installateurs répondent 200 : une empreinte inventée ne se
  rattrape pas.
- En cas de doute après une poussée : consulter l'onglet Actions et la release, ne pas relancer à
  l'aveugle.
