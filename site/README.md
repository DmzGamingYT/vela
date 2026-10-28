# Vela — site vitrine

Site public de Vela, en HTML, CSS et JavaScript statiques. La page suit une direction sobre,
inspirée de Dia et Zephium : d’abord un navigateur crédible, l’atelier ensuite.

- **Palette** : neutre chaud — papier `#faf8f5` le jour, charbon `#151518` la nuit — et un seul
  accent indigo (`#5b56d6` en clair, `#a8a3ff` en sombre).
- **Typographie** : Iowan Old Style / Georgia pour les titres, sans-serif système pour le reste,
  monospace pour les fichiers et les empreintes.
- **Matière** : coins de 20 à 26 px, ombres douces, verre réservé à l’en-tête et à la palette ⌘K.
- **Mouvement** : uniquement l’ouverture de la palette et la démo de l’atelier. Aucun contenu
  n’est masqué en attendant le défilement, et `prefers-reduced-motion` coupe les deux animations.

Le thème clair suit le système par défaut ; le bouton soleil/lune force un thème et le retient dans
`localStorage` (`vela-theme`). Les maquettes de l’application suivent le thème choisi.

## En ligne

- Production : <https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page>
- Preview : <https://site-68d82f56e26e4679ad55315fdbb685df.freebuff.page>

## Aperçu local

```bash
python3 -m http.server 4173 --directory site/public
```

Ouvrir <http://localhost:4173>.

## Structure

```text
site/
├── public/
│   ├── index.html     page unique en onze sections
│   ├── styles.css     thème, maquettes d’interface, adaptation mobile
│   ├── script.js      thème, menu, bascule Browse/Work, CTA par plateforme
│   ├── captures/      captures réelles de l’app, JPEG 1440×900 (accueil clair et
│   │                  sombre)
│   ├── og-vela.png    visuel 1200×630
│   ├── favicon.svg
│   └── robots.txt
├── og/
│   ├── og.html        source du visuel 1200×630
│   └── make-og.cjs    capture via le Chromium d’Electron
├── worker.js          sert les assets via env.ASSETS
└── deploy.json        manifeste Sites (assetsDirectory: ./public)
```

Les onze sections : héros et palette ⌘K, bascule Browse/Work, capture réelle de l’app, trois gestes
puis la frise des versions, trois fondamentaux, commandes, dix thèmes, confidentialité en deux colonnes,
modèles (marques des fournisseurs), téléchargement (fichiers, tailles, états, empreintes SHA-256), FAQ
et feuille de route. La feuille de route distingue explicitement ce qui est disponible de ce qui est
prévu.

Les captures viennent de l’application elle-même, prises à 1440×900 en @2x puis converties en JPEG.
Le thème du site choisit l’image de l’accueil affichée, sans requête supplémentaire. La petite fenêtre
est montrée par une maquette en HTML et CSS, jouable et coupée par « Réduire les animations », jamais
par une capture. Chaque légende décrit ce que l’image montre réellement : la frise des versions dit ce
que chaque release a apporté, et le numéro de version mène à ses notes de version sur GitHub (un lien
par ligne, pas de mot répété).

Aucune dépendance, aucun appel réseau, aucune police distante : la page fonctionne hors ligne. Le
visuel Open Graph est généré avec le Chromium d’Electron, depuis `site/og/og.html` :

```bash
./node_modules/.bin/electron site/og/make-og.cjs   # écrit site/public/og-vela.png
```

## Déploiement

Le manifeste est prévu pour Freebuff Sites. Le Worker ne fait que servir `env.ASSETS`.
Déployer d’abord en preview, vérifier, puis publier en production.

Le canonical et `og:url` pointent vers le domaine de production ; si le domaine change, mettre à jour
les deux balises dans `public/index.html`.

## Vérifié

Assets en 200 avec les bons types, aucun appel réseau externe, aucun débordement horizontal de
1440 px à 390 px (le tableau des fichiers défile dans son conteneur), menu mobile et Échap, bascule
Browse/Work au clavier (`aria-pressed`) avec ses trois étapes animées, démo de la petite fenêtre jouable
et coupée par `prefers-reduced-motion`, CTA qui pointe vers le bon fichier selon la plateforme, capture
réelle servie en 1440×900 (accueil permuté par le thème), sept lignes de frise dont le numéro de version
porte le lien, dix marques de fournisseurs, `details` pour les empreintes et la FAQ.

Contrastes calculés dans les deux thèmes : texte principal 16:1, texte secondaire 6,7:1 (clair) et
8,3:1 (sombre), texte tertiaire 5,2:1 et 5,3:1, accent 5,3:1 et 8,1:1, `kbd` 5:1 et 4,7:1. Tous les
textes courants passent AA.
