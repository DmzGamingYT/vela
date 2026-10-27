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
npm run dist:mac    # .dmg + .zip universel, arm64 et x64 → release/mac/
npm run dist:win    # installateur NSIS → release/win/
npm run dist:linux  # AppImage + .deb → release/linux/

Chaque plateforme a son dossier dans `release/` : `mac/`, `win/`, `linux/`
(avec `latest-*.yml` pour la mise à jour automatique).
```

### Builds macOS

Trois bundles sortent du même build, tous les trois conservés le temps que
l’universel soit validé sur une vraie machine Intel :

| Fichier | Usage |
| --- | --- |
| `Vela-<version>-universal.dmg` / `.zip` | un seul téléchargement, Apple silicon **et** Intel |
| `Vela-<version>-arm64.dmg` / `.zip` | Apple silicon seul, plus léger |
| `Vela-<version>-x64.dmg` / `.zip` | Intel seul |

`latest-mac.yml` liste les trois `.zip` : electron-updater préfère l’arm64 sur
Apple silicon et écarte l’arm64 sur Intel (il prend alors l’x64 ou
l’universel). Le script de contrôle lit le manifeste et interroge la vraie
fonction d’electron-updater :

```bash
node scripts/verify-mac-update.cjs release/mac/latest-mac.yml
lipo -archs release/mac/mac-universal/Vela.app/Contents/MacOS/Vela
# arm64 x86_64
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
- macOS : `.dmg`/`.zip` universel, arm64 et x64. Windows : NSIS. Linux : AppImage ; `.deb` — réinstallez le paquet.

> macOS exige une signature Developer ID **et** une notarisation pour que ShipIt remplace le bundle
> tout seul. Avec les secrets ci-dessous, l’installation est silencieuse : Vela télécharge le `.zip`
> de sa plateforme et le bundle est remplacé à la fermeture, sans repasser par le `.dmg`. Sans
> certificat Apple, le téléchargement reste automatique mais l’installation est refusée par
> Gatekeeper : l’app affiche l’erreur et le lien `Releases` (installez le `.dmg`).

## Signature macOS et Windows (préparation)

**État réel : rien n’est signé.** La release v0.3.8 est signée ad hoc (pas de Developer ID, pas de
notarisation) et l’installateur Windows n’a pas de certificat. Ce dépôt ne contient aucun secret et
ne fabrique aucune signature : les deux tableaux ci-dessous disent seulement ce qu’il faudra
renseigner, une fois les certificats obtenus.

La chaîne macOS est déjà automatisée dans `.github/workflows/release.yml`. Il faut une adhésion au
[programme développeur Apple](https://developer.apple.com/programs/) (99 $/an) et un certificat
**Developer ID Application** exporté en `.p12` depuis Trousseau d’accès.

```bash
scripts/mac-signing.sh ~/Desktop/DeveloperID.p12   # prépare et envoie les cinq secrets
```

| Secret macOS | Contenu |
|---|---|
| `MAC_CERT_P12` | le `.p12` encodé en base64 (le script s’en charge) |
| `MAC_CERT_PASSWORD` | mot de passe du `.p12` |
| `APPLE_ID` | identifiant Apple du compte développeur |
| `APPLE_APP_SPECIFIC_PASSWORD` | mot de passe d’application généré sur appleid.apple.com |
| `APPLE_TEAM_ID` | Team ID à 10 caractères (developer.apple.com → Membership) |

Le certificat est importé dans un trousseau temporaire du runner, `electron-builder` signe avec
`build/entitlements.mac.plist` (hardened runtime), puis `@electron/notarize` soumet l’app à Apple et
agrafe le ticket (`xcrun stapler`). Le job vérifie ensuite les trois bundles, `codesign --verify
--deep --strict`, `spctl --assess` et `stapler validate` avant de publier.

Pour Windows, le certificat de signature de code se prépare de la même façon, mais **le workflow ne
l’utilise pas encore** : c’est le second point de blocage.

| Secret Windows | Contenu |
|---|---|
| `WIN_CERT_P12` | certificat de signature de code (`.pfx`) encodé en base64 |
| `WIN_CERT_PASSWORD` | mot de passe du `.pfx` |

`electron-builder` lit aussi `CSC_LINK` / `CSC_KEY_PASSWORD` pour les deux plateformes ; n’utiliser
qu’un seul couple à la fois, sinon le certificat chargé n’est pas celui qu’on croit.

### Ce qui bloque aujourd’hui

1. **Aucun certificat Apple** : pas d’adhésion au programme développeur, donc pas de Developer ID à
exporter. Le workflow produit un build ad hoc et le signale en annotation ; Squirrel.Mac exige que
l’ancien et le nouvel app partagent la même identité de signature, donc la mise à jour macOS ne peut
pas s’installer seule.
2. **Aucun certificat Windows** : SmartScreen affiche « Windows a protégé votre PC ». Le workflow
Windows n’a pas d’étape de signature, et un certificat OV ou EV doit d’abord être acheté puis validé
auprès de l’autorité de certification (pièce d’identité de l’entreprise ou du développeur).
3. **Pas de test d’installation silencieuse** : elle ne peut être validée qu’avec les certificats en
place et une release publiée, sur une machine Apple silicon **et** une machine Intel.

Sans `MAC_CERT_P12`, le workflow continue de produire les trois builds macOS (aucun échec) mais
prévient dans les annotations : la mise à jour automatique macOS ne peut pas fonctionner dans ce cas.

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

## Accueil

La page d’accueil est un seul champ : une adresse s’ouvre, une question part vers le moteur choisi
(l’indication dans le champ dit lequel des deux se produira). En dessous, les pages récentes forment
une grille de tuiles en verre qui s’inclinent au pointeur et gardent leur favicon ; les raccourcis
complètent la grille quand l’historique est court. Les tâches du jour affichent leur progression et
une coche animée.

Le fond est une aurora d’accent : trois nappes qui dérivent lentement et suivent le curseur. Elle
s’efface avec « Réduire les animations », le mode contraste élevé ou un arrière-plan uni, et ne
touche jamais le contenu des sites.

L’horloge est locale. La météo ne demande **aucune** donnée tant que vous n’avez pas nommé une ville :
en validant, le nom tapé part vers `geocoding-api.open-meteo.com` pour trouver la ville ; ensuite, seules
ses coordonnées vont à `api.open-meteo.com`, au plus une fois par demi-heure, et le relevé reste sur
l’appareil. Aucune clé, aucun compte, aucune télémétrie. « Retirer » coupe le flux et efface la ville.

Toutes les destinations que Vela contacte elle-même sont listées dans `src/shared/network.ts` et
reprises dans Réglages › Confidentialité ; le test `network.test.ts` échoue si une adresse apparaît
dans le code sans y être déclarée.

## Ce qu’il sait faire

| | |
| --- | --- |
| **Accueil** | Fond aurora qui dérive et suit le pointeur, salutation en cascade, champ unique qui ouvre une adresse ou cherche, pages récentes en tuiles de verre inclinables, horloge et tâches avec progression. |
| **Onglets verticaux** | Titres lisibles, épinglage, réouverture du dernier onglet fermé. |
| **Épinglés et favoris** | Les onglets épinglés et les favoris forment une grille de cases compactes en verre, réduites au favicon du site avec une infobulle titre et domaine ; les onglets normaux gardent leur ligne complète. Au-delà de onze cases, une tuile « +N » ouvre la liste complète plutôt que de masquer les favoris. Les épinglés se réordonnent au glisser-déposer ou au clavier (<kbd>Alt</kbd> + flèches), passent d’un état à l’autre en les déposant sur la zone prévue (<kbd>Échap</kbd> annule), et un menu contextuel (clic droit, touche Menu ou <kbd>⇧</kbd><kbd>F10</kbd>) donne fermer, désépingler, copier l’adresse, ouvrir en vue scindée ou dans un nouvel onglet. Les icônes sont gardées sept jours dans les données de l’espace, une requête par domaine. |
| **Dossiers** | Regroupez des onglets, repliez-les d’un clic, renommez-les et glissez-les entre dossiers. |
| **Réorganisation** | Glisser-déposer pour ordonner les onglets, y compris à l’intérieur d’un dossier. |
| **Espaces** | Une partition Chromium par espace (cookies, cache, sessions), une photo ou une marque, une ambiance de fond et un filtre de traqueurs propre. Fenêtre de personnalisation avec aperçu en direct, modèles Travail, Personnel, Gaming, Études, Développement et sites épinglés préremplis. |
| **Sites épinglés** | Chaque espace a sa barre de sites sur son accueil : cartes en verre avec favicon, ajout d’une adresse glissée depuis la page. Réorganisation au glisser ou par `Alt` + flèches (focus conservé, annonce lecteur d’écran), menu contextuel (clic droit, touche Menu ou `⇧F10`) avec renommage et adresse modifiables sur place, copie vers un autre espace ou déplacement, annulable. 200 sites au plus, la barre défile au-delà de quelques rangées. Enregistrée avec l’espace, restaurée au redémarrage. |
| **Identité de navigation** | UA, client hints (`Sec-CH-UA`), langues et objet `window.chrome` alignés sur un Chrome officiel, onglets comme popups, pour la compatibilité des sites. Google peut malgré tout refuser une connexion : voir [Limites connues](#limites-connues). |
| **Vue scindée** | Deux pages côte à côte, séparateur redimensionnable, largeur mémorisée. |
| **Barre de commande** | `⌘K` : onglets, espaces, historique, actions et agent dans une seule palette. |
| **Thèmes de couleur** | Dix teintes (indigo, rouge, orange, ambre, vert, turquoise, bleu, violet, rose, graphite) et une couleur personnalisée : tout le châssis suit, jamais le contenu des sites. Mode clair/sombre, verre réglable, thème par espace, contraste élevé. |
| **Brief du jour** | Trois cartes calculées localement : reprendre, finir, focus. Aucune requête réseau. |
| **Agent** | Rapports en Markdown à partir des onglets joints. Démo locale, ou dix fournisseurs avec votre clé. |
| **Travaux** | Chaque rapport de l’atelier est conservé : liste consultable, renommage, archivage, réouverture. |
| **Tunnel de recherche** | Sujet → angle → sous-angle → site : carte de sources réellement récupérées, tensions détectées, entonnoir par pertinence, période, langue, type, étiquette et niveau de détail. Cartes déplaçables, renommables, ajoutées, reliées ou supprimées à la main. Export Markdown, PDF, PNG, SVG, JSON, OPML et rapport en note. |
| **Clés API** | OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, OpenRouter ou serveur local. Trousseau système, test de clé en un clic. |
| **Notes** | Panneau en verre, notes Markdown en fichiers `.md` avec étiquettes, épinglage et recherche ; extraction par glisser-déposer depuis la page, surlignage synchronisé, croquis, liens `[[note]]`, notes vocales locales et réécriture par le modèle. |
| **Recherche dans la page** | `⌘F` : compteur de correspondances, résultat suivant/précédent, sans quitter l’onglet. |
| **Marque-pages** | `⌘D` garde la page affichée (étoile dans la barre d’adresse), `⌘⇧O` ouvre la liste, import des favoris Chrome, Brave, Edge et Safari. Les favoris ont un ordre explicite (champ `order`, de 0 à n-1) : réordonnancement au glisser ou par `Alt` + flèches depuis le rail, nouveaux favoris en fin de liste, import dans l’ordre du fichier source. Au premier démarrage après la 0.3.7, l’ordre est attribué selon la liste existante, après copie horodatée de `vela.json` et une ligne dans `migration.log`. |
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

### Espaces

La fenêtre d’espace montre à gauche un aperçu vivant du châssis (rail, barre latérale, onglets,
accueil) et règle à droite le nom, l’avatar, la teinte, l’ambiance, les sites épinglés et l’isolation.
Cinq modèles préremplissent l’ensemble en un clic — nom, teinte, avatar, ambiance et barre de sites
(Travail : Notion, Gmail, Drive, Agenda, Slack ; Gaming : Steam, GeForce NOW, Discord…). Un espace
existant se rouvre par double-clic sur sa pastille.

Les sites épinglés vivent dans l’espace, pas dans un profil global : la barre de l’accueil ne montre que
ceux de l’espace affiché, et changer d’espace change la barre. Les adresses sont validées (http et
https seulement, doublons retirés, 24 sites au maximum), le favicon est demandé directement au site
épinglé, et rien n’est envoyé ailleurs. Sur l’accueil, une carte s’ouvre dans un nouvel onglet, se
réordonne ou se retire sans passer par la fenêtre d’espace ; glisser une adresse sur la barre l’y
ajoute. Le nom saisi (« Études 2026 ») propose les sites du type correspondant, sans rien imposer.

L’avatar peut être l’initiale de l’espace, l’une des huit marques dessinées, ou une photo importée :
elle est recadrée au carré, zoomée, déplacée, puis teintée aux couleurs de l’espace et enregistrée en
144 px dans `vela.json` — jamais envoyée ailleurs. L’ambiance (Aurore, Brume, Braise, Nuit) teinte le
fond du châssis derrière le verre, jamais le contenu des pages ; « Aurore » respire lentement et se
tait avec « Réduire les animations ».

Chaque espace garde sa partition Chromium : cookies, cache et sessions réellement séparés. Le filtre
de traqueurs peut être retiré pour un espace précis sans toucher aux autres — vérifié en chargeant une
page de test : deux requêtes de mesure arrêtées dans un espace filtré, aucune dans l’espace sans filtre.
Les raccourcis clavier par espace et les extensions ne sont pas gérés par cette version.

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

### Notes

Le panneau Notes vit à droite de la page : recherche immédiate, filtres par étiquette, notes épinglées en
tête, cartes en verre dépoli et éditeur Markdown avec aperçu. Chaque note garde son espace, sa source et
ses étiquettes dans `index.json` ; le corps reste un fichier `.md` lisible dans n’importe quel éditeur.

Trois formats cohabitent sans plugin : Markdown enrichi (titres, listes, tableaux, liens, blocs de code),
listes de tâches rendues avec leurs cases, et croquis dessiné dans une petite ardoise puis inséré en image
dans la note. Les liens `[[Titre]]` relient les notes entre elles avec autocomplétion, un panneau « Notes
liées » (vers, citée par, liens cassés) et la création d’une note manquante en un clic ; renommer une note
met à jour ceux qui la citent, avec annulation. Un extrait déposé conserve l’URL et le titre de la page d’origine : sur une page, la poignée
« Glisser dans les notes » apparaît près de la sélection et lance un glisser natif (un clic capture
directement le passage). Le fichier glissé porte un en-tête `source` / `titre`, relu à la dépose.

Le surlignage utilise l’API Highlight de Chromium : un clic sur « Surligner la sélection » colore le passage
dans la page et l’ajoute à la note de cette page (créée au besoin), avec sa date. Les surlignages sont
repeints au chargement suivant, uniquement sur la même URL.

Cinq actions IA s’appliquent à la note ouverte — reformuler, résumer, traduire, corriger, embellir — et
« Générer une note IA » lit la page active et propose points clés, synthèse et plan d’action. Sans modèle
configuré, le repli est local et clairement étiqueté « Mode démo » ; avec une clé, l’appel passe par le
fournisseur choisi dans Réglages › Modèles. Aucune télémétrie.

Une note vocale s’enregistre depuis l’éditeur : l’autorisation du micro est expliquée avant la demande
système, la durée et la pause sont visibles, et le fichier audio reste dans le dossier de données de
l’espace. Il se lit dans la note et peut être supprimé. La transcription passe d’abord par un serveur local ;
vers un fournisseur distant, l’enregistrement ne part qu’après une confirmation explicite.

## Site public

Le site vitrine est dans [site/](site/) : HTML, CSS et JavaScript statiques, servis par un Worker qui ne fait que rendre `env.ASSETS`. Il a un thème sombre et un thème clair, ce dernier suivant le système par défaut.

- Production : <https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page>
- Preview : <https://site-68d82f56e26e4679ad55315fdbb685df.freebuff.page>

Aperçu local : `python3 -m http.server 4173 --directory site/public`.

## Limites connues

### Connexion Google

L’identité annoncée (User-Agent, client hints, `window.chrome`) suffit à ouvrir la plupart des sites,
mais Google peut **refuser la connexion** : un profil peut être marqué côté serveur, et rien dans
l’app ne peut annuler ce marquage. Vela n’ajoute **aucune imitation supplémentaire de Chrome** —
empiler des leurres ne rend pas le compte plus sûr, et casse la compatibilité au premier changement
de Google.

- **Solution durable : importer votre session depuis Chrome ou Safari** (cookies du profil déjà
  connecté). Ce n’est **pas encore pris en charge** ; l’import existant ne concerne que les favoris.
- **En attendant :** pour un bouton « Se connecter avec Google » sur un site tiers, ouvrez la
  connexion dans votre navigateur système (clic droit sur le bouton, ou depuis le menu Vela), puis
  revenez sur la page : Vela n’essaie pas de contourner le contrôle de Google.
- Un **nouvel espace** part d’une session Chromium vierge, ce qui suffit parfois, mais ne règle pas
  un profil déjà marqué.

### Extensions et synchronisation

- **Extensions Chrome : non prises en charge.** Aucun chargeur, aucun dossier d’extensions, aucune
  API `chrome.*` d’extension. Ce n’est pas un réglage caché.
- **Synchronisation de compte : non prise en charge.** Vela n’a ni compte, ni serveur, ni
  synchronisation entre appareils. Les favoris, notes et espaces restent sur la machine ; les
  favoris peuvent être importés depuis Chrome, Brave, Edge, Chromium ou Safari, ou depuis un export
  HTML.

### macOS sans signature

Le build n’est pas notarié. Au premier lancement, macOS peut dire que Vela est endommagé ou d’un
développeur non identifié :

1. Ouvrez le `.dmg`, glissez **Vela** dans **Applications**.
2. **Clic droit sur Vela → Ouvrir**, puis confirmez « Ouvrir ».
3. Si le message persiste :

   ```bash
   xattr -cr /Applications/Vela.app
   open /Applications/Vela.app
   ```

**Pourquoi l’installation silencieuse n’est pas possible :** macOS ne remplace un bundle que si
l’ancien et le nouveau portent la **même identité de signature Developer ID** et si le nouveau est
notarié. Sans certificat, Gatekeeper refuse le remplacement ; Vela télécharge bien la mise à jour,
mais l’installation échoue et renvoie vers le `.dmg`. Il n’existe pas de contournement honnête :
seule une vraie signature Apple débloque ce point (voir
[Signature macOS et Windows](#signature-macos-et-windows-préparation)).

### Windows et SmartScreen

L’installateur NSIS n’est pas signé. Windows SmartScreen peut donc afficher « Windows a protégé votre
PC » : l’éditeur est inconnu et le fichier n’a pas encore de réputation. Cliquez sur **Informations
complémentaires → Exécuter quand même**. Un certificat de signature de code supprime cet écran ; il
n’est pas encore en place.

### Le reste

- Une seule fenêtre ; les dossiers ne se réordonnent pas entre eux et ne s’imbriquent pas.
- Caméra, position et notifications sont refusés aux pages. Le micro n’est ouvert qu’à Vela, pour
  vos notes vocales, après une demande système explicite.
- Le filtre est une liste embarquée : pas de mise à jour distante ni de filtrage cosmétique.
- Aucune clé n’est fournie : le mode connecté demande la vôtre pour être essayé.

## Licence

MIT.
