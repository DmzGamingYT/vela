# Vela 0.3.16 — notes de version et checklist

Préparé le 29 octobre 2026, **publié le 31 octobre 2026** : release `v0.3.16`, six installateurs,
site aligné sur la même version. La publication démarre à la poussée sur `main` d'un commit dont
`package.json` annonce une version encore sans release (`.github/workflows/release.yml`).

État de la préparation :

| Élément | État |
|---|---|
| Version `package.json` | **0.3.16** |
| Version `package-lock.json` | **0.3.16** (racine et `packages[""]`) |
| Notes de version | rédigées ci-dessous, prêtes à coller dans la release |
| Checklist plateformes | ci-dessous, à cocher au moment de la publication |
| Release GitHub | **publiée** — [v0.3.16](https://github.com/DmzGamingYT/vela/releases/tag/v0.3.16) |
| Site | **mis à jour** en 0.3.16, empreintes et liens de la release |
| Signature / notarisation | **aucune** — pas de certificat dans ce dépôt, donc pas de mise à jour macOS automatique |

## Notes de version (proposition de texte)

> Vela 0.3.16 — un navigateur qui ne perd rien, et des sources qui disent ce qu'elles valent.

### Sécurité et confidentialité

- La surface IPC est fermée : chaque canal est réservé à la coque, à la petite fenêtre (`mini:*`) ou aux
  quatre canaux dont les pages ont besoin. Un cadre imbriqué n'obtient rien.
- La politique de sécurité du contenu n'autorise plus aucun script inline en dehors du script de thème,
  dont l'empreinte est vérifiée par un test, et les connexions sortantes sont limitées à la météo ; le
  WebSocket local n'existe plus que dans le serveur de développement.
- Sur macOS, l'installateur `.dmg` téléchargé est comparé au manifeste de la release : taille et empreinte
  SHA-512, en temps constant. Sans manifeste, aucun installateur n'est proposé.
- La clé Google voyage dans l'en-tête `x-goog-api-key`, plus jamais dans l'URL.
- Le fournisseur « Local » ne prétend plus que rien ne sort de la machine quand l'endpoint configuré est
  distant : l'état affiché dépend de l'URL, l'hôte est nommé, et l'enregistrement demande une confirmation.
- La page Confidentialité est régénérée depuis la même liste de flux que l'application : métadonnées
  inévitables comprises.

### Données

- Une clé héritée (`secret.bin`) n'est supprimée qu'après relecture de la nouvelle copie chiffrée ;
  trousseau indisponible, clé illisible ou écriture ratée laissent le fichier en place.
- Renommer une note écrit d'abord le fichier et l'index, ensuite les notes liées ; un index refusé remet le
  fichier en place, et les liens non réécrits sont annoncés.
- Enregistrer une vingt-et-unième carte du tunnel est refusé au lieu d'évincer la plus ancienne.
- Un index de notes illisible ou un `vela.json` corrompu arrêtent l'écriture au lieu d'effacer.

### Tunnel de recherche

- Les angles deviennent des lentilles de lecture (« Vue d'ensemble », « Définitions », « Études »,
  « Actualité », « Retours d'expérience ») ; le fournisseur n'est plus qu'une provenance.
- La pertinence est plafonnée et motivée : plus de 100 % partout, et le détail dit combien de mots de la
  requête se trouvent dans le titre, le texte ou le domaine.
- Les extraits viennent de `og:description` et de paragraphes réels : plus de fragment de script, plus de
  débordement horizontal, trois lignes puis « Voir plus ».
- Une requête accentuée sans petit mot grammatical (« vélo cargo ») interroge enfin Wikipédia en français.

### Accueil

- Accueil réorganisé en modules, avec une carte de notes rapides, et site aligné sur la même présentation.

### Sous le capot

- 37 fichiers de tests, 384 tests, types et build verts.
- Aucune nouvelle destination réseau : le manifeste de mise à jour est lu sur `github.com`, déjà déclaré.

## Checklist des plateformes

### 0. Avant tout (local)

| # | Étape | Commande | Attendu |
|---|---|---|---|
| 1 | Dépendances | `npm ci` | code 0, lockfile inchangé |
| 2 | Types | `npm run typecheck` | code 0 |
| 3 | Tests | `npm test` | 37 fichiers, 384 tests |
| 4 | Build | `npm run build` | code 0, `out/` produit |
| 5 | Dépendances | `npm audit` | 2 critiques + 1 modérée, **toutes dans la chaîne de test** (décision à prendre, cf. C1 de l'audit) |
| 6 | Version | `node -p "require('./package.json').version"` | `0.3.16` |
| 7 | Secrets | `git status --short` | aucun `.env`, aucun certificat, aucun profil Electron |

### 1. macOS (arm64 + x64 + universel)

| # | Étape | Commande ou moyen | Attendu |
|---|---|---|---|
| 1 | Build | `npm run dist:mac` | `release/mac/` avec trois `.dmg` et trois `.zip` |
| 2 | Universalité | `lipo -archs release/mac/mac-universal/Vela.app/Contents/MacOS/Vela` | `x86_64 arm64` |
| 3 | Manifeste | `node scripts/verify-mac-update.cjs release/mac/latest-mac.yml` | manifeste cohérent, trois entrées |
| 4 | Signature | `codesign -dv --verbose=4 release/mac/mac-universal/Vela.app` | **ad hoc** tant qu'aucun secret `APPLE_*` n'est fourni |
| 5 | Notarisation | `xcrun stapler validate release/mac/mac-universal/Vela.app` | échoue sans certificat : à documenter, pas à simuler |
| 6 | Identité | Ouvrir l'app, menu Vela, À propos | « Vela », version 0.3.16, icône B |
| 7 | Nom système | `lsappinfo info -only name "$(pgrep -f 'Vela.app/Contents/MacOS/Vela')"` | `Vela` |
| 8 | Démarrage | Lancer sur un profil neuf | onboarding, zéro exception |
| 9 | Mise à jour | Depuis 0.3.15 installée | **impossible sans Developer ID** : le dire dans la release |

### 2. Windows (x64, NSIS)

| # | Étape | Commande ou moyen | Attendu |
|---|---|---|---|
| 1 | Build | `npm run dist:win` | `release/win/Vela-0.3.16-x64.exe` |
| 2 | Installation | Exécuter l'installateur | nom « Vela », dossier au choix, raccourci |
| 3 | Signature | Propriétés du fichier, onglet Signatures | **aucune** : SmartScreen avertira, à écrire dans la release |
| 4 | Désinstallation | Paramètres, Applications | entrée « Vela » unique, suppression propre |
| 5 | Données | `%APPDATA%\Vela` après désinstallation | conservées (comportement attendu, à vérifier) |

### 3. Linux (AppImage + deb)

| # | Étape | Commande ou moyen | Attendu |
|---|---|---|---|
| 1 | Build | `npm run dist:linux` | `Vela-0.3.16-x86_64.AppImage`, `Vela-0.3.16-amd64.deb` |
| 2 | AppImage | `chmod +x` puis lancement | démarrage, icône, nom dans le dock |
| 3 | deb | `sudo dpkg -i` puis `vela` | entrée de menu, catégorie Réseau |
| 4 | Mise à jour deb | Remplacer le paquet | manuelle, à dire dans la release |
| 5 | Mise à jour AppImage | `electron-updater` | à confirmer sur un vrai AppImage publié |

### 4. Après la publication

| # | Étape | Commande | Attendu |
|---|---|---|---|
| 1 | Empreintes | `shasum -a 256` sur les six fichiers | ✅ reportées sur le site |
| 2 | Liens | `curl -I` sur les six URL `releases/download/v0.3.16/…` | ✅ 200 |
| 3 | Manifeste | `curl -sL releases/download/v0.3.16/latest-mac.yml` | ✅ version 0.3.16, trois entrées |
| 4 | Page Releases | Ouvrir la release | ✅ notes, six installateurs, pas de brouillon |

### 5. Mise à jour du site (seulement après l'étape 4)

| # | Fichier | À changer |
|---|---|---|
| 1 | `site/public/index.html` | `softwareVersion`, `downloadUrl`, surtitre `v0.3.16`, titre de la section téléchargement, six URL et six empreintes |
| 2 | `site/public/nouveautes/index.html` | nouvelle entrée 0.3.16 en tête, « Version courante », description et pied de page |
| 3 | `site/public/404.html` | pied de page |
| 4 | `site/og/og.html` | surtitre de l'image de partage, puis régénération de `og-vela.png` (1200 × 630) |
| 5 | Tests | `npx vitest run src/shared/site.test.ts src/shared/docs.test.ts` | verts |

Le site peut rester une version en retard, jamais en avance : les tests le vérifient.

## Ce que la 0.3.16 ne contient pas

- Ni accueil ni barre latérale assainis (doublons de champs de recherche, favoris, icône de clé) : lot en cours.
- Ni accessibilité complète (cibles sous 28 px, parcours lecteur d'écran), ni performance mesurée sous charge.
- Ni `SECURITY.md`, ni alignement Node 22/20 entre README et CI.
- Ni correction des deux avis `npm audit` de la chaîne de test (montée majeure de Vitest à décider).
- Ni signature Windows, ni Developer ID macOS, ni notarisation : impossible sans certificat.

## Garde-fous

- Ne pas pousser sur `main` sans accord explicite : la poussée déclenche les trois builds et la publication.
- Ne pas créer de tag à la main : le workflow s'en charge, et un tag orphelin bloquerait la release suivante.
- Ne pas utiliser `scripts/upload-release.sh` : ce script manuel pointe encore sur la v0.1.0 et les anciens
  noms de fichiers. La publication passe uniquement par le workflow.
- Ne pas modifier le site avant que les six installateurs répondent 200 : une empreinte inventée ne se rattrape pas.
- En cas de doute après une poussée : consulter l'onglet Actions et la release, ne pas relancer à l'aveugle.
