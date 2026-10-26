# Vela

**Le web, votre atelier.**

Vela est un navigateur de bureau pour macOS, Windows et Linux : des espaces isolés, une vue scindée, un brief du jour calculé sur l’appareil, des notes Markdown et un agent qui lit vos onglets.

Le site vitrine public se trouve dans [site/](site/).

Construit avec Electron, React et TypeScript. Aucun compte, aucune télémétrie, aucun serveur Vela.

L’interface suit l’identité du site vitrine : papier chaud `#faf8f5` le jour et charbon `#151518` la nuit, un seul accent indigo (`#5b56d6` en clair, `#a8a3ff` en sombre), titres en Iowan Old Style / Georgia, contenu mat et verre réservé au chrome (rail, barre latérale, feuilles) et un lavis d’accent discret. Les réglages sont organisés en deux panneaux, et la page **Modèles** reprend la liste de fournisseurs et de clés.

---

## L’idée

Trois gestes ont guidé cette v0.1 :

- **Les espaces** — un contexte par projet, avec ses cookies, ses sessions et ses onglets (façon Arc).
- **La journée** — un brief local, des profils de travail et une lecture croisée des onglets (façon Dia).
- **L’atelier** — un agent sur un canvas, des notes à côté de la page, des fichiers que vous possédez (façon Zephium).

## Démarrer

Prérequis : **Node.js 22+** et **npm**.

```bash
npm install
npm run dev
```

Build de production et vérifications :

```bash
npm run typecheck   # TypeScript (main, preload, renderer)
npm test            # tests unitaires (URL, brief, agent, fournisseurs)
npm run build       # build dans out/
npm run dist:mac    # .dmg + .zip (arm64 et x64) → release/mac/
npm run dist:win    # installateur NSIS → release/win/
npm run dist:linux  # AppImage + .deb → release/linux/

Chaque plateforme a son dossier dans `release/` : `mac/`, `win/`, `linux/`
(avec `latest-*.yml` pour la mise à jour automatique).
```

Les builds ne sont pas signés en v0.1 : macOS demandera un clic droit → Ouvrir, Windows affichera SmartScreen.

## Mises à jour automatiques

Vela se met à jour toute seule en arrière-plan via `electron-updater` et les releases GitHub
(`DmzGamingYT/vela`). Aucune action à faire :

- Contrôle silencieux ~12 s après le démarrage, puis toutes les 3 h, au retour de veille et quand
  la fenêtre reprend le focus (jamais plus d’une vérification toutes les 30 min).
- Si une version existe : téléchargement automatique en arrière-plan (bandeau de progression dans
  `Réglages → À propos`).
- Installation automatique à la fermeture de Vela ; `Redémarrer maintenant` reste disponible pour
  l’appliquer tout de suite. `Vérifier` et `Releases` restent dans `Réglages → À propos` pour un
  contrôle manuel.
- macOS : `.dmg`/`.zip` (arm64 + x64). Windows : NSIS. Linux : AppImage ; `.deb` — réinstallez le paquet.

> macOS exige une signature Developer ID pour que ShipIt remplace le bundle tout seul. Sans
> certificat Apple, le téléchargement est automatique mais l’installation peut être refusée :
> l’app affiche alors l’erreur et le lien `Releases` (installez le `.dmg`). Windows et Linux
> installent sans intervention.

Publier une version : **rien à faire à la main**. Le workflow `.github/workflows/release.yml`
construit les 3 plateformes et publie la release dès qu’un commit sur `main` porte une version de
`package.json` qui n’a pas encore de release (`workflow_dispatch` permet aussi de le lancer à la
main). Il joint les artefacts (`latest-mac.yml`, `latest.yml`, `latest-linux.yml` inclus) — c’est ce
que lit l’updater.

```bash
npm version patch   # 0.1.1 → 0.1.2 : bump + commit
git push            # la release se construit et se publie en arrière-plan
```

## Browse et Work

Deux modes, un seul commutateur en haut de la barre latérale (ou `⌘⇧A`).

- **Browse** — la navigation ordinaire : onglets, dossiers, vue scindée, historique, tout le web.
- **Work** — l’atelier : l’IA travaille dans la scène principale. On joint des onglets comme sources,
on décrit le résultat attendu, l’agent lit et rédige en direct, puis on relit et on enregistre en note.
Les pages restent vivantes : on retrouve ses onglets intacts en revenant en Browse.
Chaque rapport rejoint la liste **Travaux** : on le rouvre tel quel, on le renomme, on l’archive.

## Ce qu’il sait faire

| | |
| --- | --- |
| **Onglets verticaux** | Titres lisibles, épinglage, réouverture du dernier onglet fermé. |
| **Dossiers** | Regroupez des onglets, repliez-les d’un clic, renommez-les et glissez-les entre dossiers. |
| **Réorganisation** | Glisser-déposer pour ordonner les onglets, y compris à l’intérieur d’un dossier. |
| **Espaces isolés** | Une partition Chromium par espace : deux comptes au même site, sans conflit. |
| **Identité de navigation** | UA, client hints (`Sec-CH-UA`), langues et objet `window.chrome` alignés sur un Chrome officiel, onglets comme popups : Google ne prend plus Vela pour un navigateur embarqué. |
| **Vue scindée** | Deux pages côte à côte, séparateur redimensionnable, largeur mémorisée. |
| **Barre de commande** | `⌘K` : onglets, espaces, historique, actions et agent dans une seule palette. |
| **Brief du jour** | Trois cartes calculées localement : reprendre, finir, focus. Aucune requête réseau. |
| **Agent** | Rapports en Markdown à partir des onglets joints. Démo locale, ou dix fournisseurs avec votre clé. |
| **Travaux** | Chaque rapport de l’atelier est conservé : liste consultable, renommage, archivage, réouverture. |
| **Clés API** | OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, OpenRouter ou serveur local. Trousseau système, test de clé en un clic. |
| **Notes** | Markdown stocké en fichiers `.md`, capturés depuis la page, à côté du web. |
| **Recherche dans la page** | `⌘F` : compteur de correspondances, résultat suivant/précédent, sans quitter l’onglet. |
| **Bloqueur local** | Liste embarquée de domaines publicitaires, compteur visible dans la barre d’adresse. |

## Raccourcis

Sur Windows et Linux, remplacez `⌘` par `Ctrl`.

| Raccourci | Action |
| --- | --- |
| `⌘K` | Barre de commande |
| `⌘L` | Barre d’adresse |
| `⌘F` | Rechercher dans la page |
| `⌘T` / `⌘W` | Nouvel onglet / fermer |
| `⌘⇧T` | Rouvrir le dernier onglet fermé |
| `⌘⇧D` | Vue scindée |
| `⌘E` | Notes |
| `⌘J` | Agent |
| `⌘⇧A` | Basculer Browse / Work |
| `⌘⇧B` | Brief du jour |
| `⌘S` | Replier la barre latérale |
| `⌘1…9` | Onglets 1 à 9 |
| `⌘,` | Réglages |
| `Échap` | Fermer une surcouche |

## Architecture

```text
src/
├── main/                 processus principal Electron
│   ├── index.ts          fenêtre, cycle de vie, sécurité de la coque
│   ├── browser.ts        état, espaces, IPC, brief, notes
│   ├── tabs.ts           un WebContentsView natif par onglet, layout et raccourcis
│   ├── privacy.ts        filtre local par partition, permissions, user-agent
│   ├── blocklist.ts      domaines publicitaires et de mesure
│   ├── agent.ts          démo locale, OpenAI, Anthropic et Google en SSE
│   ├── notes.ts          fichiers Markdown + index
│   ├── store.ts          vela.json, clés chiffrées par fournisseur, normalisation
│   └── menu.ts           menu natif français
├── preload/              pont typé `window.vela`, aucune API Node côté page
├── shared/               types, URL, brief, agent, fournisseurs (testés avec Vitest)
└── renderer/             interface React + zustand
```

**Chaque onglet est un `WebContentsView` natif**, pas une `<webview>`. Le renderer mesure les zones `.pane-body` et envoie leurs rectangles au processus principal ; les vues sont placées au-dessus du DOM. Les surcouches (palette, brief, réglages, agent) masquent les vues natives le temps de l’interaction ; le tiroir de notes, lui, réduit la largeur de la page.

- `sandbox: true`, `contextIsolation: true`, aucun Node dans les pages.
- Les pages ne reçoivent jamais de preload.
- `setWindowOpenHandler` ouvre les liens externes dans un nouvel onglet du même espace.
- Les clés API sont chiffrées ensemble par le trousseau système (Keychain, DPAPI, libsecret) et ne sont jamais renvoyées au renderer.

## Données

Tout est local, dans le dossier de données de l’application :

```text
~/Library/Application Support/Vela/   (macOS)
%APPDATA%/Vela/                       (Windows)
~/.config/Vela/                       (Linux)
├── vela.json      espaces, onglets, historique, réglages
├── secrets.json   clés API chiffrées, une par fournisseur (si configurées)
└── notes/         fichiers .md + index.json
```

L’historique et les compteurs de blocage peuvent être effacés depuis **Réglages**.

## Agent

- **Démo locale** (par défaut) : le rapport est simulé à partir des titres et adresses des onglets. Aucune page ne quitte la machine.
- **Modèle connecté** : dans **Réglages → Modèles**, choisissez un fournisseur, collez votre clé et testez-la. Les dix fournisseurs sont OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, OpenRouter et un serveur local (Ollama, LM Studio ou tout endpoint compatible OpenAI).

Les clés vivent dans le trousseau système, jamais dans `vela.json` ni dans l’interface. « Tester » interroge la liste des modèles du fournisseur et affiche *Clé acceptée* ou l’erreur exacte. Le modèle et l’endpoint sont modifiables par fournisseur ; Anthropic et Google utilisent leur propre protocole, les autres le format OpenAI en streaming SSE.

Le canvas permet de choisir les onglets sources, d’arrêter une recherche, de copier le rapport ou de l’enregistrer en note.

## Site public

Le site vitrine est dans [site/](site/) : HTML, CSS et JavaScript statiques, servis par un Worker qui ne fait que rendre `env.ASSETS`. Il a un thème sombre et un thème clair, ce dernier suivant le système par défaut.

- Production : <https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page>
- Preview : <https://site-68d82f56e26e4679ad55315fdbb685df.freebuff.page>

Aperçu local : `python3 -m http.server 4173 --directory site/public`.

## Limites connues de la v0.1

- Une seule fenêtre ; les dossiers ne se réordonnent pas entre eux et ne s’imbriquent pas.
- Pas d’extensions Chrome, d’import de favoris ni de synchronisation.
- Caméra, micro, position et notifications sont refusés aux pages.
- Pas de zoom par onglet, pas de gestionnaire de téléchargements.
- Le filtre est une liste embarquée : pas de mise à jour distante ni de filtrage cosmétique.
- Aucune clé n’est fournie : le mode connecté demande la vôtre pour être essayé.
- La connexion Google passe le contrôle « navigateur sécurisé » ; Google peut malgré tout refuser un
  profil déjà marqué côté serveur — un espace neuf repart d’une session Chromium vierge.

## Licence

MIT.
