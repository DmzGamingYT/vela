# Vela — site vitrine

Site public de Vela, en HTML, CSS et JavaScript statiques, servi par un Worker Cloudflare
(`worker.js`) qui pose les en-têtes et lit `public/`. Cinq pages, aucune dépendance, aucun appel
réseau, aucune police distante : le site fonctionne hors ligne.

- **Palette** : neutre chaud — papier `#faf8f5` le jour, charbon `#151518` la nuit — et un seul
  accent, indigo `#5b5bd6` par défaut, remplaçable par les dix pastilles de la page d’accueil
  (`localStorage` → `vela-site-accent`).
- **Typographie** : Iowan Old Style / Georgia pour les titres, sans-serif système pour le reste,
  monospace pour les fichiers et les empreintes.
- **Matière** : coins de 18 à 26 px, ombres douces, verre réservé à l’en-tête.
- **Mouvement** : les blocs `.reveal` apparaissent au défilement, jamais avant, et
  `prefers-reduced-motion` les affiche d’emblée.

Le thème clair suit le système par défaut ; le bouton soleil/lune force un thème et le retient dans
`localStorage` (`vela-theme`). Les captures suivent le thème choisi.

## En ligne

- Production : <https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page>
- Preview : <https://site-68d82f56e26e4679ad55315fdbb685df.freebuff.page>

Le canonical, `og:url` et `sitemap.xml` pointent vers le domaine de production. **Si le domaine
change, ces trois endroits sont à mettre à jour** (`public/*/index.html`, `public/sitemap.xml`,
`public/robots.txt`).

## Aperçu local

```bash
python3 -m http.server 4173 --directory site/public
```

Ouvrir <http://localhost:4173>. Le worker n’est pas exécuté : les en-têtes de sécurité et de cache
ne se voient qu’en preview.

## Structure

```text
site/
├── public/
│   ├── index.html              accueil : héros, trois gestes, confidentialité, téléchargement
│   ├── navigateur/index.html   cinq chapitres, une capture par chapitre
│   ├── confidentialite/index.html  ce qui reste, ce qui sort, flux par flux
│   ├── aide/index.html         installation, builds non signés, raccourcis
│   ├── nouveautes/index.html   la frise des versions
│   ├── 404.html                page servie par le worker sur une adresse inconnue
│   ├── base.css                jetons, typographie, en-tête, boutons, utilitaires
│   ├── home.css                accueil uniquement
│   ├── pages.css               pages intérieures et 404
│   ├── site.js                 thème, accent, menu, CTA par plateforme, copie des empreintes
│   ├── captures/               captures réelles + variantes 720/1080/1440 en JPEG et AVIF
│   ├── og-vela.png             visuel de partage 1200×630
│   ├── favicon.svg · favicon-32x32.png · apple-touch-icon.png
│   ├── robots.txt · sitemap.xml
├── tools/
│   ├── captures.mjs            dérive les variantes d’image (sips + ffmpeg/SVT-AV1)
│   └── privacy.mjs             génère la page Confidentialité depuis son gabarit
├── og/
│   ├── og.html                 source du visuel 1200×630
│   └── make-og.cjs             capture via le Chromium d’Electron
├── worker.js                   en-têtes + cache + 404, puis env.ASSETS
└── deploy.json                 manifeste Sites (assetsDirectory: ./public)
```

## Captures

Les originaux vivent dans `public/captures/*.jpg` en 1440×900, tels que sortis de l’application.
`tools/captures.mjs` en dérive les variantes servies par les `<picture>` :

| Fichier | Usage |
| --- | --- |
| `nom.jpg` | 1440×900, repli JPEG desktop |
| `nom-1080.jpg` | 1080×675, repli JPEG courant |
| `nom-720.jpg` | 720×450, repli JPEG mobile |
| `nom.avif` | 1440×900, AVIF (CRF 30) |
| `nom-1080.avif` | 1080×675 |
| `nom-720.avif` | 720×450 |

```bash
node site/tools/captures.mjs          # ne réécrit que ce qui a changé
node site/tools/captures.mjs --force  # tout régénérer
```

Une capture mobile pèse ~11 Ko en AVIF 720 contre ~135 Ko pour le JPEG 1440 d’origine. Le script
saute les fichiers plus récents que leur source ; il faut donc `--force` après un changement de
réglage d’encodage.

Le visuel de partage se régénère à part :

```bash
./node_modules/.bin/electron site/og/make-og.cjs   # écrit site/public/og-vela.png
```

## En-têtes et cache

`worker.js` ajoute à chaque réponse : CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` et `Cross-Origin-Opener-Policy`. La CSP autorise `'unsafe-inline'` pour le
script de thème (il doit s’exécuter avant le premier rendu) et les styles inline des pastilles.

Le cache suit le type de fichier, faute d’empreinte dans les noms :

| Chemin | Cache-Control |
| --- | --- |
| `/captures/*`, icônes, `og-vela.png` | `max-age=86400, stale-while-revalidate=604800` |
| `.css`, `.js` | `max-age=600, stale-while-revalidate=86400` |
| HTML | `max-age=0, must-revalidate` |

## Déploiement

Le manifeste est prévu pour Freebuff Sites. Déployer d’abord en preview, vérifier, puis publier en
production.

## Vérifié

- 390 px et 1440 px : aucun débordement horizontal, un seul `h1` par page, titres en ordre.
- Captures servies en AVIF avec repli JPEG, `srcset` 720/1080/1440, largeur et hauteur déclarées
  (aucun décalage de mise en page).
- CTA qui suit la plateforme **et l’architecture** : Apple silicon reçoit le DMG `arm64` (123 Mo),
  Intel le `x64`, le reste le DMG universel.
- Empreintes SHA-256 complètes au presse-papiers, vérifiables avec `shasum -a 256`.
- Menu mobile : ouverture, `Échap`, clic extérieur, retour du focus sur le bouton.
- Cibles tactiles portées à 40–42 px sans épaissir l’en-tête (débord du pseudo-élément).
- Anneau de focus foncé vers l’encre : ≥ 5:1 pour les dix accents (l’ambre seul tombait à 2,1:1).
- `prefers-reduced-motion` coupe les apparitions.
- Contrastes du texte : principal 16:1, secondaire 6,7:1 (clair) / 8,3:1 (sombre), tertiaire 5,2:1
  et 5,3:1. Tous les textes courants passent AA.
