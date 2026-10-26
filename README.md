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

macOS est signé (Developer ID) et notarisé dès que les secrets de signature sont configurés — voir
[Signature macOS](#signature-macos). À défaut, le build reste signé ad hoc : clic droit → Ouvrir au
premier lancement, et la mise à jour automatique macOS reste inopérante. Windows affiche SmartScreen.

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

> macOS exige une signature Developer ID **et** une notarisation pour que ShipIt remplace le bundle
> tout seul. Avec les secrets ci-dessous, l’installation est silencieuse : Vela télécharge le `.zip`
> de sa plateforme et le bundle est remplacé à la fermeture, sans repasser par le `.dmg`. Sans
> certificat Apple, le téléchargement reste automatique mais l’installation est refusée par
> Gatekeeper : l’app affiche l’erreur et le lien `Releases` (installez le `.dmg`).

## Signature macOS

La chaîne complète est automatisée dans `.github/workflows/release.yml`. Il faut une adhésion au
[programme développeur Apple](https://developer.apple.com/programs/) (99 $/an) et un certificat
**Developer ID Application** exporté en `.p12` depuis Trousseau d’accès.

Cinq secrets suffisent, à envoyer une seule fois :

```bash
scripts/mac-signing.sh ~/Desktop/DeveloperID.p12
```

| Secret | Contenu |
|---|---|
| `MAC_CERT_P12` | le `.p12` encodé en base64 (le script s’en charge) |
| `MAC_CERT_PASSWORD` | mot de passe du `.p12` |
| `APPLE_ID` | identifiant Apple du compte développeur |
| `APPLE_APP_SPECIFIC_PASSWORD` | mot de passe d’application généré sur appleid.apple.com |
| `APPLE_TEAM_ID` | Team ID à 10 caractères (developer.apple.com → Membership) |

Le certificat est importé dans un trousseau temporaire du runner, `electron-builder` signe avec
`build/entitlements.mac.plist` (hardened runtime), puis `@electron/notarize` soumet l’app à Apple et
agrafe le ticket (`xcrun stapler`). Le job vérifie ensuite `codesign --verify --deep --strict`,
`spctl --assess` et `stapler validate` avant de publier.

Sans `MAC_CERT_P12`, le workflow continue de produire un build ad hoc (aucun échec) mais prévient
dans les annotations : la mise à jour automatique macOS ne peut pas fonctionner dans ce cas,
Squirrel.Mac exigeant que l’ancien et le nouvel app partagent la même identité de signature.

Publier une version : **rien à faire à la main**. Le workflow `.github/workflows/release.yml`
construit les 3 plateformes et publie la release dès qu’un commit sur `main` porte une version de
`package.json` qui n’a pas encore de release (`workflow_dispatch` permet aussi de le lancer à la
main). Il joint les artefacts (`latest-mac.yml`, `latest.yml`, `latest-linux.yml` inclus) — c’est ce
que lit l’updater.

```bash
npm version patch   # 0.1.1 → 0.1.2 : bump + commit
git push            # la release se construit et se publie en arrière-plan
```

## Navigation et Travail

Deux modes, un seul commutateur en haut de la barre latérale (ou `⌘⇧A`).

- **Navigation** — le web ordinaire : onglets, dossiers, vue scindée, historique, tout le web.
- **Travail** — le tunnel de recherche occupe la scène : un sujet descend en angles, sous-angles puis
sources réelles, avec leur extrait, leur pertinence et les contradictions entre pages. L’agent reste
accessible en panneau (`⌘J`) sans masquer la carte. Chaque carte est enregistrée automatiquement dans
l’espace actif, et la barre latérale les liste : on rouvre, on renomme, on duplique.
Les pages restent vivantes : on retrouve ses onglets intacts en revenant en Navigation.
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
| **Thèmes de couleur** | Dix teintes (indigo, rouge, orange, ambre, vert, turquoise, bleu, violet, rose, graphite) et une couleur personnalisée : tout le châssis suit, jamais le contenu des sites. Mode clair/sombre, verre réglable, thème par espace, contraste élevé. |
| **Brief du jour** | Trois cartes calculées localement : reprendre, finir, focus. Aucune requête réseau. |
| **Agent** | Rapports en Markdown à partir des onglets joints. Démo locale, ou dix fournisseurs avec votre clé. |
| **Travaux** | Chaque rapport de l’atelier est conservé : liste consultable, renommage, archivage, réouverture. |
| **Tunnel de recherche** | Sujet → angle → sous-angle → site : carte de sources réellement récupérées, tensions détectées, entonnoir par pertinence, période, langue, type, étiquette et niveau de détail. Cartes déplaçables, renommables, ajoutées, reliées ou supprimées à la main. Export Markdown, PDF, PNG, SVG, JSON, OPML et rapport en note. |
| **Clés API** | OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, OpenRouter ou serveur local. Trousseau système, test de clé en un clic. |
| **Notes** | Markdown stocké en fichiers `.md`, capturés depuis la page, à côté du web. |
| **Recherche dans la page** | `⌘F` : compteur de correspondances, résultat suivant/précédent, sans quitter l’onglet. |
| **Marque-pages** | `⌘D` garde la page affichée (étoile dans la barre d’adresse), `⌘⇧O` ouvre la liste, import des favoris Chrome, Brave, Edge et Safari. |
| **Historique** | `⌘Y` : liste groupée par jour, réouverture et suppression entrée par entrée. |
| **Impression** | `⌘P` : boîte de dialogue système, export PDF compris. |
| **Bloqueur local** | Liste embarquée de domaines publicitaires, compteur visible dans la barre d’adresse. |
| **Bouclier par site** | Le bouclier ouvre le détail des requêtes arrêtées sur la page, avec un interrupteur par site (rien pour les autres). |
| **Sélection → agent** | Menu contextuel sur un passage : résumer, expliquer, traduire, simplifier, ou l’ajouter aux notes. |
| **Citations** | « Capturer la sélection » garde le passage, l’URL source et la date dans une note Markdown. |
| **Onglets en veille** | Les vues inactives sont déchargées (5 max en mémoire), avec indicateur discret et mémoire rendue affichée. |
| **Rangement par site** | La palette crée des dossiers automatiques par domaine, annulables depuis la notification. |
| **Skills** | `⌘K` puis `/résumer`, `/comparer`, `/extraire`, `/citer` préparent la demande de l’agent. |
| **Traduction de BD** | `⌘K` → « Traduire la BD » : OCR local des planches, traduction par le fournisseur réglé, calque français lisible par-dessus les bulles. |

## Raccourcis

Sur Windows et Linux, remplacez `⌘` par `Ctrl`.

| Raccourci | Action |
| --- | --- |
| `⌘K` | Barre de commande |
| `⌘L` | Barre d’adresse |
| `⌘F` | Rechercher dans la page |
| `⌘T` / `⌘W` | Nouvel onglet / fermer |
| `⌘⇧T` | Rouvrir le dernier onglet fermé |
| `⌘D` | Garder la page en marque-page |
| `⌘⇧O` | Marque-pages |
| `⌘Y` | Historique |
| `⌘P` | Imprimer |
| `⌘⇧D` | Vue scindée |
| `⌘E` | Notes |
| `⌘J` | Agent |
| `⌘⇧A` | Basculer Navigation / Travail |
| `⌘⇧B` | Brief du jour |
| `⌘S` | Replier la barre latérale |
| `⌘1…9` | Onglets 1 à 9 |
| `⌘,` | Réglages |
| `⌘⇧Espace` | Vela et la palette depuis n’importe quelle app (global) |
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
├── shared/               types, URL, brief, agent, fournisseurs, thèmes (testés avec Vitest)
└── renderer/             interface React + zustand
```

**Apparence** — `shared/theme.ts` ne contient que des couleurs de départ : chaque thème est une teinte d’accent dont on dérive le survol, le fond doux, le texte sur accent, le verre, le focus et les liens ; une couleur personnalisée passe par le même calcul. Le renderer pose ces jetons sur `:root` (`data-mode`, `data-theme`, `data-glass`, `data-contrast`) et les met en cache dans `localStorage` pour être rejoués avant le premier pixel. Le contenu des onglets vit dans des `WebContentsView` séparées : aucun jeton ne l’atteint.

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

### Tunnel de recherche

Le mode **Travail** ne démarre pas par un formulaire mais par un tunnel : le sujet saisi devient la racine
d’une carte où chaque niveau affine la recherche (angles, sous-angles, puis pages). Les fournisseurs sont
remplaçables (`src/main/tunnel.ts`) : DuckDuckGo (HTML, sans clé), Wikipédia, arXiv, Hacker News et GDELT.
Chaque nœud *Site* correspond à une page effectivement récupérée ; une page inaccessible est marquée comme
telle. Les résultats sous 35 % de pertinence ne créent aucun nœud, deux pages maximum viennent d’un même
domaine, et le seuil de l’entonnoir (60 % par défaut) masque le reste. Les sous-angles sont des thèmes
communs aux pages (« Outils », « Comparatifs », « Guides », « Limites »), jamais des noms de domaine.
Les tensions s’appuient uniquement sur des phrases citées, jamais sur une déduction.
L’entonnoir agit en direct sur la carte : il se combine selon le type de source, la pertinence, la période,
la langue, une étiquette (« histoire », « technique »…) et le niveau de détail de la page (longueur de
l’extrait). Les cartes survivent à l’entonnoir dès qu’elles sont écrites à la main : on peut les déplacer,
les renommer, en ajouter sous n’importe quel nœud, en relier ou en supprimer, y compris avec leur descendance.
Le fond de la carte est un canvas animé (constellation qui suit le pointeur), désactivé avec « Réduire les
animations » ; les cartes sont en verre dépoli avec un liseré d’accent au survol et un badge de catégorie.
La carte, la mise en page, les filtres, l’édition, le rapport et les exports sont dans `src/shared/tunnel.ts`,
testés sans Electron.

### Traduction de BD

Sur une page de lecture, `⌘K` → **Traduire la BD** injecte le script de `userscripts/comic-translate.user.js`
dans l’onglet actif. Les planches sont relues par Tesseract (OCR local, dans la page), les bulles regroupées,
puis les répliques traduites par le fournisseur choisi dans Réglages › Modèles. Le calque est posé sur
l’image : fond clair sur le texte d’origine, texte français ajusté à la boîte. Le script ne détient aucune
clé : deux appels seulement lui sont prêtés par le preload des pages, lire une image avec la session de
l’onglet et traduire des répliques, derrière un jeton propre à l’onglet qui expire en trente minutes.

Limite : les lecteurs qui dessinent la planche dans un `<canvas>` échappent à la détection, faute d’image
à relire.

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
