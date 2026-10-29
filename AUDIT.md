# Audit Vela — phases 0 et 1

Date : 29 octobre 2026.
Périmètre examiné : répertoire de travail de la branche `audit/corrections-vela`, commit de base `efc729f`, **avec des modifications et fichiers non suivis préexistants** (travail d'audit antérieur, non commité). Version du dépôt : **0.3.15** ; la demande cite 0.3.12, qui ne correspond plus à l'état du dépôt ni au site publié.
Nature de ce document : inventaire, relevé, puis suivi des correctifs de la phase 2. Les entrées marquées « corrigé dans l'arbre » décrivaient des modifications **déjà présentes avant l'audit** ; celles marquées « corrigé — lot 1 » ont été apportées par le premier lot de la phase 2, avec tests et captures (section 11).

## 1. Travaux réalisés et preuves d'exécution

| Vérification | Commande | Résultat |
|---|---|---|
| Types | `npm run typecheck` | succès, code 0 |
| Tests | `npm test` | **31 fichiers, 336 tests réussis**, code 0 |
| Build | `npm run build` | succès, code 0 ; 1,9 Mo dans `out/`, JS principal 905,81 kB (193,6 kB gzip), CSS 295,18 kB (50,4 kB gzip) |
| Dépendances | `npm audit --json` | code 1 : **2 critiques, 1 modérée, 0 haute**, toutes dans la chaîne de test (C1) |
| Audit réseau | `npx vitest run src/shared/network.test.ts` | 3 tests réussis (portée limitée, E3) |
| Parité site/aide | `npx vitest run src/shared/site.test.ts src/shared/docs.test.ts` | 31 tests réussis |
| Application réelle | harnais `site/trailer/lib.cjs`, profil jetable, CDP | 10 captures clair/sombre, **aucune exception renderer** pendant les scénarios |
| Démarrage | mesure instrumentée | interface prête en **444 ms**, processus app **232 Mo** au repos |
| Site publié | `curl` | accueil **200**, version **v0.3.15** ; **6** liens d'installateur testés en HEAD : **200** |
| Image de partage | `sips` | `site/public/og-vela.png` : **1200 × 630** |

Captures de cette passe : [accueil, deux onglets](screenshots/audit-phase1-accueil-deux-onglets-clair.png) · [accueil, 14 favoris](screenshots/audit-phase1-accueil-favoris-clair.png) · [accueil sombre](screenshots/audit-phase1-accueil-sombre.png) · [réglages, apparence](screenshots/audit-phase1-reglages-apparence.png) · [réglages, raccourcis](screenshots/audit-phase1-reglages-raccourcis.png) · [notes](screenshots/audit-phase1-notes.png) · [agent](screenshots/audit-phase1-agent.png) · [nouvel espace](screenshots/audit-phase1-nouvel-espace.png) · [tunnel vide, clair](screenshots/audit-phase1-tunnel-vide-clair.png) · [tunnel vide, sombre](screenshots/audit-phase1-tunnel-vide-sombre.png).

## 2. Score de risque

Deux notes, parce que l'état livré et l'arbre de travail diffèrent :

- **Commit de base (`efc729f`) : risque élevé.** Trois scénarios critiques existaient dans le code : purge d'enregistrements après un index de notes illisible, remplacement d'un `vela.json` corrompu, et exécution d'actions d'agent sans validation humaine.
- **Arbre de travail après les lots 1 et 2 : risque modéré.** Les trois scénarios critiques de perte de données, la fusion de `secret.bin`, l'ordre du renommage de note et le plafond silencieux des cartes sont corrigés et couverts par des tests, comme l'IPC, la CSP, l'intégrité du DMG et les deux descriptions de flux. Restent, sans perte de données ni contournement connu : la fusion de `secret.bin` (A3), l'ordre d'écriture du renommage de note (A4), le plafond silencieux des cartes du tunnel (A5), et les défauts de Tunnel et d'interface décrits plus bas. La signature et la notarisation restent impossibles sans certificat, donc le risque d'installation non vérifiée subsiste à la source, désormais détectable par empreinte.

Aucune note chiffrée : les scénarios sont qualifiés par leur impact, pas par une probabilité mesurée.

## 3. Inventaire

- **Processus principal** : `src/main/index.ts` (fenêtre, nom, menu, erreurs), `browser.ts` (orchestration, IPC, près de 1 900 lignes), `tabs.ts` (vues natives), `store.ts` (persistance et migrations), `notes.ts` et `noteAudio.ts`, `tunnel.ts`, `agent.ts` et `pageDriver.ts`, `mini.ts`, `privacy.ts`, `updater.ts`, `favicons.ts`, `blocklist.ts`, `menu.ts`.
- **Ponts** : `src/preload/index.ts` (API `window.vela` complète) et `src/preload/page.ts` (page web).
- **Interface** : React/Zustand dans `src/renderer/`, 15 455 lignes de `styles.css`.
- **Données** : `vela.json`, `secrets.json` chiffré par `safeStorage` si disponible, `notes/`, `avatars/`, vignettes et cache d'icônes. Aucun profil personnel lu.
- **Autres** : `site/` (site statique, `worker.js`, tests de parité), `rust/` (coque Wry séparée, non exécutée), `userscripts/`, `scripts/`, `build/`, `.github/workflows/release.yml`, `electron-builder.yml`, README, aide et pages Confidentialité.

## 4. Constats

Statuts : **relevé — phase 2** (établi, non corrigé) ; **corrigé dans l'arbre** (modification préexistante, non commitée, vérification partielle) ; **à vérifier** (preuve insuffisante, méthode indiquée).

| ID | Sévérité | Zone | Fichier:ligne ou capture | Description et preuve | Reproduction | Correctif proposé | Statut |
|---|---|---|---|---|---|---|---|
| A1 | critique | A | `src/main/notes.ts:93-118`, `src/main/browser.ts:187-194` | Un index de notes illisible était lu comme une liste vide ; la purge des audios non référencés pouvait supprimer des enregistrements valides. | Index `notes/index.json` invalide + un `.webm` dans `notes/audio`, lancer l'app : le constructeur lève désormais une erreur avant la purge. Tests unitaires ciblés verts. | Conserver le fichier, expliquer la restauration, proposer une récupération guidée. | corrigé — lot 2 |
| A2 | critique | A | `src/main/store.ts:352-362`, `src/main/store.ts:491-510` | Un `vela.json` corrompu était remplacé par l'état par défaut à la sauvegarde suivante. | Fichier JSON invalide : la lecture lève, aucune écriture n'est programmée ; test de migration adapté. | Arrêter proprement, conserver l'original, proposer une sauvegarde horodatée. | corrigé — lot 2 |
| A3 | majeur | A | `src/main/store.ts:744-766` | La migration de `secret.bin` supprimait l'ancien fichier même si le chiffrement était indisponible, si le déchiffrement échouait ou si l'écriture n'était pas confirmée. | Corrigé : la clé n'est importée que si le fournisseur actif n'en a pas déjà une ; le fichier n'est supprimé qu'après relecture de `secrets.json` et comparaison. Chiffrement indisponible, clé illisible, écriture ratée : `secret.bin` reste en place. 5 tests dans `src/main/store.data.test.ts`. | Reste : une clé héritée non attribuable reste sur le disque sans interface pour la récupérer (aucune donnée perdue). | corrigé — lot 2 |
| A4 | majeur | A | `src/main/notes.ts:216-235` | Renommer une note réécrivait les notes liées **avant** d'enregistrer la note et l'index ; les erreurs d'écriture étaient ignorées. Une interruption laissait des liens pointant vers un titre inexistant. | Corrigé : fichier renommé puis écrit, index écrit, et seulement ensuite les notes liées ; si l'index ne peut pas être écrit, le fichier revient à son ancien nom. Les échecs de liens sont comptés (`linksFailed`) et annoncés dans l'éditeur. 3 tests dans `src/main/notes.test.ts`. | Vérifié dans l'app réelle : renommage, liens réécrits, graphe à jour. | corrigé — lot 2 |
| A5 | majeur | A | `src/main/store.ts:602-614` | Enregistrer une 21e carte du tunnel évinçait silencieusement la plus ancienne (`[clean, ...maps].slice(0, 20)`). | Corrigé : `saveTunnelMap` rend un booléen ; au-delà de `TUNNEL_MAP_LIMIT` (20), une nouvelle carte est refusée, la mise à jour d'une carte existante reste permise, et l'interface l'annonce (toast, événement `done.saved`, copie refusée). 3 tests dans `src/main/store.data.test.ts`. | Mesuré sur l'app réelle : avant, la 21e évince la première ; après, elle est refusée et la première reste. | corrigé — lot 2 |
| A6 | mineur | A | `src/main/tunnel.ts:410-415`, `src/main/tunnel.ts:500-510` | Les angles de premier niveau restent nommés d'après le fournisseur : « Sites web », « Panorama », « Travaux », « Actualité », « Débats ». Ce sont des types de source, pas des angles thématiques. | Lancer un tunnel : titres d'angles visibles dans la carte. | Dériver des angles du sujet, et n'utiliser les fournisseurs que comme provenance. | relevé — phase 2 |
| A7 | mineur | A | `src/shared/tunnel.ts:158-178`, `src/main/tunnel.ts:504` | La pertinence mesure une couverture lexicale, et un mot présent dans le titre suffit à 100 %. Les nœuds d'angle sont créés avec `relevance: 100` en dur. | `scoreRelevance('youtube', {title:'YouTube'})` vaut 100 ; lecture de la création d'angle. | Pondérer titre, description et domaine, plafonner, afficher la raison ; ne pas noter un angle comme une source. | relevé — phase 2 |
| A8 | mineur | A | `src/main/tunnel.ts:153-160`, `src/main/tunnel.ts:537-547`, `TunnelView.tsx:466` | Les résultats arXiv sont marqués « vérifiés » depuis l'API sans récupération de la page individuelle, alors que l'interface affirme « chaque page est réellement récupérée ». | Comparer le chemin arXiv au chemin `snapshotPage` ; aucun test ne distingue les deux. | Distinguer « source d'API » et « page récupérée », ou récupérer la page. | relevé — phase 2 |
| A9 | mineur | A | `src/main/tunnel.ts:316-376` | `mainParagraphs` extrait les `<p>` du HTML brut : un paragraphe dans `<script>` peut devenir l'extrait. `og:description` n'est pas lu et une balise `content` avant `name` n'est pas reconnue. | Page synthétique avec `<script><p>ytBootstrapConfig…</p></script>` ; test absent. | Extraire sur HTML nettoyé, gérer `og:description` et l'ordre des attributs ; test dédié. | relevé — phase 2 |
| A10 | finition | A | `src/main/tunnel.ts:282-298` | Notions de facettes à vérifier : `video`, `videos` et `channel` pourraient produire des sous-angles redondants. | Lire `FACETS` et lancer un tunnel vidéo. | Normaliser les notions avant création des sous-angles. | à vérifier |
| B1 | mineur | B | [capture tunnel clair](screenshots/audit-phase1-tunnel-vide-clair.png), `.tunnel-search` + input | Double contour du champ du tunnel : la bordure du formulaire et l'anneau de focus global de l'`input` se superposent. Mesuré : `form` bordure 1 px, `input` `box-shadow: paper 0 0 0 2px, accent 0 0 0 4px`. | Ouvrir le tunnel : le champ est focalisé au montage. | Un seul anneau, porté par le formulaire ; neutraliser le focus interne. | relevé — phase 2 |
| B2 | mineur | B | [capture tunnel clair](screenshots/audit-phase1-tunnel-vide-clair.png), `TunnelView.tsx:191-195,663-670` | Badges 「 carte locale · 0 source · 0 nœuds 」 affichés en permanence, y compris sans carte ouverte : c'est la « carte fantôme » signalée. | Ouvrir Travail sans carte : badges visibles. | Masquer les compteurs quand aucune carte n'existe. | relevé — phase 2 |
| B3 | mineur | B | [accueil](screenshots/audit-phase1-accueil-deux-onglets-clair.png), `PaneHeader.tsx:90-95`, `StartPage.tsx:287-300` | Deux points d'entrée de recherche simultanés sur l'accueil : la barre d'adresse (« Rechercher ou saisir une adresse ») et le champ de l'accueil (« Rechercher, saisir une adresse ou demander à l'agent »), auxquels s'ajoute le champ de ville. | Capture : deux champs visibles en haut de l'accueil. | Un seul champ primaire sur l'accueil ; la barre d'adresse reprend le relais hors accueil. | relevé — phase 2 |
| B4 | mineur | B | mesures instrumentées | Typographie très petite : 9 px (`.tile-host`), 9,5 px (titres de cartes, pied de page), 10,5 px (`.home-hint`), 11 px (puces du tunnel). Lisibilité fragile, surtout en sombre. | Measure CDP des styles calculés. | Plancher de 11-12 px pour le texte porteur d'information. | relevé — phase 2 |
| B5 | mineur | B | [capture 14 favoris](screenshots/audit-phase1-accueil-favoris-clair.png), `Sidebar.tsx:165,688` | Au-delà de 12 favoris, les cases affichent des titres tronqués à deux caractères (« F1 », « F2 »…) ; la tuile « +3 » renvoie bien à « Tous les favoris ». | Créer 14 favoris « Favori 1…14 ». | Tronquer le titre avec une ellipse lisible, ou agrandir la case ; garder l'infobulle. | relevé — phase 2 |
| B6 | mineur | B | [réglages](screenshots/audit-phase1-reglages-apparence.png), `SettingsPanel.tsx:45`, `Icon.tsx:188-193` | L'icône de « Modèles » (clé) se lit comme un symbole masculin ♂. L'entrée « Raccourcis » utilise désormais un clavier, ce qui règle le premier point mais laisse l'ambiguïté sur les clés API. | Capture de la barre latérale des réglages. | Dessiner une clé franche (anneau + tige horizontale) ou réutiliser l'icône de clé des champs API. | relevé — phase 2 |
| B7 | finition | B | [notes](screenshots/audit-phase1-notes.png), `NotesDrawer.tsx:1087-1147` | La grille d'actions des notes alterne deux colonnes puis une action pleine largeur ; l'alignement paraît accidentel. | Capture de Notes, zéro note. | Grille régulière 2×2, ou une seule rangée secondaire. | relevé — phase 2 |
| C1 | majeur | C | `package.json:34-45`, sortie `npm audit` | `tinypool` critique, `vitest` critique par dépendance, `@vitest/mocker` modéré. Outils de développement ; exploitabilité dans cette CI non démontrée. La correction proposée par npm est un changement majeur de Vitest. | `npm audit --json` : 2 critiques, 1 modérée. | Analyser les conditions des avis ; monter Vitest après accord (changement majeur). | relevé — phase 2 |
| C2 | mineur | C | `wc -l` | Concentration : `styles.css` 15 455 lignes, `browser.ts` 1 903, `SettingsPanel.tsx` 1 434, `NotesDrawer.tsx` 1 306. Coût de revue et risque de régression. | `wc -l src/main/browser.ts src/renderer/src/styles.css`. | Extraction progressive, après accord (réécriture de module > 300 lignes). | relevé — phase 2 |
| C3 | mineur | C | `src/main/index.ts:227` | `console.log('[vela] barre de menus prête…')` reste dans le processus principal de production. | Lancer l'app empaquetée et lire la console. | Retirer ou conditionner au mode développement. | relevé — phase 2 |
| C4 | finition | C | `grep -rn "} catch {" src` | 152 blocs `catch` vides ou silencieux. Beaucoup sont des replis assumés, mais certains masquent des pertes (A3, A4). | Comptage ; revue des cas sensibles. | Commenter chaque repli et journaliser les échecs de données. | relevé — phase 2 |
| D1 | critique | D | `src/main/agent.ts:452-490` | Le mode « agir » exécutait directement l'action du modèle. Une confirmation native par action et une confirmation distincte pour Entrée ont été ajoutées, avec test de refus. Le scénario d'injection réelle n'a pas été joué. | `npx vitest run src/main/agent.test.ts src/shared/agentLoop.test.ts` ; dialogue non testé dans Electron. | Vérifier le dialogue réel, le changement de page entre confirmation et action, et un scénario hostile. | corrigé — lot 1 |
| D2 | majeur | D | `src/main/browser.ts:1234-1239`, `src/main/mini.ts:26,198` | Le registre IPC ignorait `event.sender` : tous les canaux étaient accessibles à toute fenêtre chargeant le preload. La mini-fenêtre charge le **preload complet** (`preload/index.js`), donc toute l'API `window.vela`. | Corrigé : `ipcPolicy.ts` classe l'émetteur (coque / mini / page / inconnu), `Browser.allowIpc` refuse tout cadre non principal et applique la politique à chaque `handle` et à chaque `on` ; la mini-fenêtre ne garde que `mini:*` ; le preload des pages ne garde que `PAGE_CHANNELS`. 6 tests dans `src/main/ipcPolicy.test.ts`. | Reste à faire : un pont dédié à la mini-fenêtre (elle charge encore le preload complet, mais n'atteint plus que `mini:*`). | corrigé — lot 1 |
| D3 | majeur | D | `src/renderer/index.html:5-6` | CSP : `script-src 'self' 'unsafe-inline'`, `connect-src` acceptait tout HTTP(S)/WS(S). Une injection dans l'interface disposait d'une surface large. | Corrigé : `script-src 'self'` + empreinte SHA-256 du seul script inline (thème) ; `connect-src` limité à la météo, au pont local (`ws://localhost` et `ws://127.0.0.1`) et à `'self'`. 3 tests dans `src/shared/csp.test.ts`, dont la vérification de l'empreinte. | Vérifié à l'exécution : `securitypolicyviolation` vide, interface fonctionnelle. | corrigé — lot 1 |
| D4 | majeur | D | `src/main/updater.ts:95-160` | Le DMG macOS manuel était accepté sur un code HTTP et la longueur reçue ; aucun calcul d'empreinte avant de proposer l'ouverture. | Corrigé : lecture de `latest-mac.yml`, empreinte SHA-512 et taille exactes comparées en temps constant pendant le téléchargement ; fichier rejeté et supprimé en cas d'écart, aucun installateur proposé sans manifeste. 5 tests dans `src/main/integrity.test.ts`. | La signature Developer ID reste impossible sans certificat : documentée, non simulée. | corrigé — lot 1 |
| E1 | majeur | E | `src/main/browser.ts:1028-1043`, `SettingsPanel.tsx:318-333`, `network.ts:138-147` | Le fournisseur « Local » accepte une URL HTTP(S) distante, mais le flux restait décrit comme local : « Rien ne quitte la machine ». | Corrigé : `isLoopbackEndpoint` décide d'après l'URL ; l'état du flux devient « Hôte distant », un avertissement s'affiche sous le champ, et l'enregistrement d'un endpoint distant demande une confirmation native. Captures [avant](screenshots/lot1-avant-endpoint-distant.png) / [après](screenshots/lot1-apres-endpoint-distant.png). | Vérifié à l'exécution : l'avertissement nomme l'hôte (`exemple.fr`). | corrigé — lot 1 |
| E2 | majeur | E | `src/shared/providers.ts:232-240`, `network.ts:131-136` | La page Confidentialité dit que la clé voyage dans l'en-tête ; pour Google elle est placée dans le paramètre `key` de l'URL. Une URL peut être journalisée par des intermédiaires. | Corrigé : `x-goog-api-key` pour le chat et le test de clé, aucun `key=` dans l'URL ; tests dans `src/shared/providers.test.ts` et `network.test.ts`. | Compatibilité vérifiée par la documentation Google consultée : l'en-tête est la méthode recommandée. | corrigé — lot 1 |
| E3 | majeur | E | `src/shared/network.test.ts:36-45`, `network.ts:192-244` | Le test d'audit ne contrôlait que les URL HTTP(S) littérales, ignorait les hôtes construits dynamiquement et confondait hôtes ouverts par l'utilisateur et destinations contactées. Un nouveau flux vers un hôte de `USER_OPENED_HOSTS` serait passé. | Corrigé : trois gardes ajoutées — aucune destination de lien ouvert n'est appelée par `fetch`, chaque fichier qui appelle `fetch` doit figurer dans une liste revue, et tout hôte déclaré doit exister dans le code. 6 tests verts dans `src/shared/network.test.ts`. | Un flux construit dans un fichier déjà revu reste invisible : la liste des points d'appel est la garde. | corrigé — lot 1 |
| E4 | mineur | E | `network.ts:149-166`, `userscripts/comic-translate.user.js:218` | « Aucune donnée » pour le CDN OCR et « aucune autre donnée » pour Letterboxd étaient trop absolus : une requête révèle au minimum IP et métadonnées de transport. | Corrigé : les deux fiches nomment l'IP et les métadonnées de transport, sans dramatiser. Page Confidentialité régénérée depuis `NETWORK_FLOWS`. Captures [avant](screenshots/lot1-avant-confidentialite.png) / [après](screenshots/lot1-apres-confidentialite.png). | Le texte de la page est désormais produit par le même module que l'interface. | corrigé — lot 1 |
| F1 | mineur | F | `src/main/tunnel.ts:357-367` | `response.text()` lit toute la réponse avant `.slice(0, 400_000)` : le plafond ne borne ni le téléchargement ni la mémoire. | Lecture ; page volumineuse non testée. | Lire le flux avec un seuil et interrompre. | relevé — phase 2 |
| F2 | finition | F | mesure instrumentée | Aucune mesure de fluidité avec 50 onglets, 200 favoris ou 200 nœuds ; aucune mesure du coût du flou et des animations. Seules les bases sont mesurées (444 ms, 232 Mo, 1,9 Mo). | Harnais de charge à écrire. | Mesurer avant/après toute optimisation ; ne rien revendiquer sans chiffre. | à vérifier |
| F3 | finition | F | `StartPage.tsx:207-230`, `styles.css` | Les animations et le verre dépoli ne sont pas profilés ; leur respect de « Réduire les animations » est présent dans le code mais non vérifié à l'écran. | Lire le code ; capture avec `prefers-reduced-motion` à faire. | Vérifier visuellement et mesurer le coût GPU. | à vérifier |
| G1 | mineur | G | mesures instrumentées | Plusieurs cibles interactives sous 28 px : puces de l'accueil 26 px, actions de cartes 22 px, bouton d'info météo 15 px, boutons de dossier 20 px, niveaux du tunnel 23 px. | Mesure CDP des rectangles. | Porter les cibles à 28 px, quitte à agrandir la zone cliquable sans le visuel. | relevé — phase 2 |
| G2 | finition | G | `src/renderer/src` | Parcours clavier complet, ordre de focus, VoiceOver et annonces après déplacement ne sont pas testés. Les régions `aria-live` existent (18 occurrences) et aucun bouton visible sans nom accessible n'a été trouvé. | Revue statique + inventaire DOM. | Parcours VoiceOver et clavier documenté, captures à l'appui. | à vérifier |
| H1 | mineur | H | `README.md:233`, `README.md:360`, `src/shared/space.ts:227` | Le README annonce 200 sites épinglés à un endroit et « 24 sites au maximum » à un autre ; le code applique `MAX_SHORTCUTS = 200`. | Comparer les deux passages et la constante. | Unifier sur 200, ou corriger la constante si 24 est voulu. | relevé — phase 2 |
| H2 | mineur | H | `CommandBar.tsx:597` | Le filtre de la palette affiche « DL » au lieu de « Téléchargements ». | Ouvrir ⌘K et lire les filtres. | Libellé français complet ou abréviation explicite. | relevé — phase 2 |
| I1 | mineur | I | absence de `SECURITY.md` | Aucune politique de divulgation à la racine. | `find . -maxdepth 3 -iname 'SECURITY*'` : aucun résultat. | Ajouter un canal de signalement vérifié et les versions prises en charge. | relevé — phase 2 |
| I2 | mineur | I | `README.md:25`, `.github/workflows/release.yml:59,75,188,209` | Le README demande Node 22+, la CI fixe Node 20. | Comparer les deux. | Aligner la version et tester la matrice. | relevé — phase 2 |
| J1 | mineur | J | `site/public/index.html:371-430` | Les six empreintes SHA-256 du site n'ont pas été recalculées sur les binaires publiés ; seuls les liens ont été testés (HEAD 200). | Télécharger chaque artefact et recalculer. | Vérifier les empreintes avant toute annonce de version. | à vérifier |
| J2 | mineur | J | `site/public/index.html:340,456`, `site/public/aide/index.html:160-175` | L'accueil affirme que les mises à jour « se font ensuite toutes seules » ; l'aide explique que macOS non signé impose d'ouvrir le DMG et que le `.deb` se remplace à la main. Contradiction interne au site. | Lire les deux passages. | Nuancer l'accueil par plateforme, sans dévaloriser le produit. | relevé — phase 2 |

### Décompte

**40 entrées** : 3 critiques, 10 majeures, 21 mineures, 6 de finition.
Par zone : A 10, B 7, C 4, D 4, E 4, F 3, G 2, H 2, I 2, J 2.
**Après les lots 1 et 2 : 14 corrigées** (A1, A2, A3, A4, A5, D1, D2, D3, D4, E1, E2, E3) **et 1 mineure** (E4), soit 15. Cinq restent « à vérifier » (A10, F2, F3, G2, J1). Le décompte n'est pas le nombre de défauts du produit : l'audit reste partiel, voir la section 9.

## 5. Synthèse par zone

- **A — fonctionnel.** Le socle tient : un seul onglet d'accueil par espace, déduplication des onglets, restauration, espaces isolés, 336 tests verts. Les risques de perte de données identifiés ont reçu un correctif préexistant, non validé en conditions réelles. Les défauts de fond restants concernent le Tunnel (angles, score, extraction, plafond de cartes) et le renommage des notes.
- **B — visuel.** Le système est cohérent et les écrans testés sont lisibles. Les défauts relevés sont locaux : double anneau du champ du tunnel, badges fantômes, deux champs de recherche sur l'accueil, micro-typographie, titres de favoris tronqués, icône de clé ambiguë. Aucune mesure de contraste n'est inférieure à 4,5:1 (texte discret à 4,79:1), mais la taille très petite réduit la marge.
- **C — code.** Pas de `any`, pas de `@ts-ignore`, pas de TODO dans le code livré. En revanche, deux modules dépassent 1 300 lignes, la feuille de style 15 000, et 152 `catch` silencieux. La dette de test est réelle sur le tunnel et les migrations d'échec.
- **D — sécurité.** Les fondations sont bonnes (`sandbox`, `contextIsolation`, `nodeIntegration: false` partout, permissions refusées par défaut, navigation de la coque verrouillée). Le lot 1 ferme les trois écarts majeurs : contrôle d'émetteur par canal, CSP à empreinte, empreinte SHA-512 du DMG. Le scénario d'action d'agent est confirmé et couvert par un test de refus ; le dialogue natif lui-même n'a pas été joué dans Electron.
- **E — confidentialité et réseau.** L'inventaire déclaratif est complet et protégé par six tests, dont deux gardes nouvelles sur les points d'appel. Les deux descriptions fausses (clé Google dans l'URL, endpoint « local » distant) sont corrigées dans l'interface, dans `network.ts` et sur la page Confidentialité, régénérée depuis la même source.
- **F — performance.** Base mesurée : démarrage 444 ms, 232 Mo au repos, 1,9 Mo de sortie. Aucune mesure de charge, de flou ou de mémoire par onglet ; je ne revendique donc aucun gain.
- **G — accessibilité.** Les noms accessibles sont largement présents (192 `aria-label`), les annonces existent, mais les cibles et la typographie sont petites et aucun parcours lecteur d'écran n'a été mené.
- **H — textes.** Interface majoritairement en français et cohérente. Restent « DL », la contradiction 24/200 du README, et des formulations absolues sur la confidentialité.
- **I — build et documentation.** `productName`, `app.setName('Vela')`, icônes `.icns`/`.ico`/512, cibles universelles macOS et documentation des limites sont en place. Manquent `SECURITY.md`, l'alignement Node 22/20, et une vérification des artefacts signés (impossible sans certificats).
- **J — site.** Version, liens et image de partage sont à jour (0.3.15, HEAD 200, 1200 × 630) et les tests de parité site/aide passent. Les empreintes ne sont pas revérifiées et une phrase sur les mises à jour contredit l'aide.

## 6. E — inventaire des flux réseau

Source : `src/shared/network.ts`, recoupée avec les appels `fetch`/`net.fetch`/`src`. Comme toute requête, ces flux exposent au minimum l'IP et les métadonnées de transport.

| Destination | Déclencheur | Données | Désactivable |
|---|---|---|---|
| `geocoding-api.open-meteo.com` | validation d'une ville | nom saisi, langue | retirer la ville |
| `api.open-meteo.com` | accueil avec ville, au plus toutes les 30 min | coordonnées | retirer la ville |
| moteur choisi (8 moteurs, SearXNG configurable) | préconnexion au démarrage, puis recherche volontaire | métadonnées ; termes recherchés | changer de moteur ; ne pas rechercher |
| `html.duckduckgo.com`, Wikipédia, `hn.algolia.com`, `export.arxiv.org`, `api.gdeltproject.org` | lancement d'un tunnel | requête, langue | ne pas lancer |
| pages citées par le tunnel | vérification des sources | URL demandée, en-têtes | ne pas lancer |
| OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, OpenRouter, endpoint configuré | test de clé, agent, notes IA, traduction, transcription consentie | clé, invite, textes, audio selon l'action ; **Google met la clé dans l'URL** | mode démo ; ne pas lancer |
| `localhost:11434` **ou URL configurable** | fournisseur « Local » | demande et contenu ; **peut viser un hôte distant** | dépend de l'URL (E1) |
| `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com` | mises à jour | version, plateforme, téléchargement du DMG | aucun interrupteur |
| `cdn.jsdelivr.net` | traduction de planche | téléchargement du moteur OCR | ne pas lancer |
| `letterboxd.com` | import volontaire du journal | nom du profil public | ne pas importer |
| domaine du site | favicon absent du cache | requête d'icône | pas de réglage d'arrêt |
| sites ouverts / actions de l'agent | navigation | URL, cookies de la partition | ne pas naviguer |

À vérifier : flux indirects de Chromium/Electron, redirections, ressources dynamiques de l'OCR, détails des en-têtes et comportement de la coque Rust.

## 7. Principes empruntés à Dia

Consultation des pages officielles le **29 octobre 2026**. Aucun texte, visuel, icône ni code n'a été copié.

| Source | Ce que la page permet d'affirmer | Ce que Vela fait aujourd'hui | Décision proposée |
|---|---|---|---|
| [Getting Started](https://www.diabrowser.com/getting-started) | Chat s'ouvre avec ⌘E et s'appuie sur le contexte de l'utilisateur. | ⌘K ouvre la palette, ⌘J l'agent, ⌘E les notes. | Conserver les raccourcis Vela ; ne pas introduire un second assistant. |
| [Accueil](https://www.diabrowser.com/) | Navigateur avec assistant intégré ; pas de vente de données ni de profils publicitaires. | Navigation classique, agent optionnel, aucune télémétrie. | Principe déjà tenu ; le rendre visible par des réglages réels, pas par du texte. |
| [Sécurité](https://www.diabrowser.com/security) | Stockage local chiffré par défaut ; envoi aux partenaires IA pour traiter une demande ; conservation limitée. | Tout est local ; les envois dépendent du fournisseur choisi. | Décrire les envois avec précision (E2, E4) plutôt que promettre « rien ne sort ». |
| [Politique de confidentialité](https://www.diabrowser.com/privacy) | Compte et données de compte ; contenu utilisable pour améliorer le produit, sauf désactivation. | Aucun compte, aucune mesure d'audience. | **Ne pas adopter** : contredit la promesse de Vela. |
| [Annonce de Sync](https://www.diabrowser.com/release-notes/1-26-0-sync-is-here) | Synchronisation optionnelle, chiffrée de bout en bout, via les serveurs de Dia. | Aucune synchronisation. | **Ne pas adopter** en phase 2 ; documenter l'absence. |

**Principe non attribuable à Dia.** Les pages officielles consultées ne permettent pas d'affirmer que recherche web, saisie d'URL et demandes à l'assistant passent par **un seul champ**. Je ne présente donc pas cette idée comme un emprunt à Dia : c'est un principe produit pour Vela, qui découle de son propre engagement (« un seul chemin évident par action ») et du défaut B3.

**Principes retenus pour Vela, sans imitation :** le navigateur reste un navigateur (les fonctions de base ne changent pas) ; un seul chemin évident par action (B3, doublons d'interface) ; vocabulaire français simple et états vides qui invitent à agir (B2, B6, H2) ; hiérarchie nette et animations discrètes (F3) ; confidentialité mise en scène par de vrais réglages (E2, E4). Chaque décision sera reprise dans le lot correspondant de la phase 2.

## 8. État des problèmes connus de la demande

Cette section répond point par point à la liste fournie. « Corrigé dans l'arbre » signifie : présent avant cette passe, non commité.

- **Accueil.** Onglet d'accueil unique et compteur cohérent : corrigé dans l'arbre (`browser.ts:247-260,601-620`) et vérifié à l'exécution (un onglet, « 1 onglet ouvert »). Compteurs de notification retirés des titres (`url.ts:186-200`) ; non reproduit avec un vrai titre « (1115) YouTube ». « Sites épinglés · Personnel » : corrigé. Carte météo compacte, heure **sans secondes** (20:19) : conforme à la demande. Deux champs de recherche visibles : **reproduit** (B3).
- **Tunnel.** Extrait JavaScript et débordement : risque de code confirmé (A9), non reproduit sur une page réelle. Pertinence à 100 % : confirmée par le code (A7). Domaine tronqué, point d'état, bouclier sur le zoom, étiquettes « relie » superposées : **non vérifiés** faute de carte réelle ; méthode : enregistrer une carte de démonstration ou lancer un tunnel. Carte fantôme : **reproduite** (B2). Deux boutons « Carte » : **non reproduit** (un sélecteur Carte/Liste et une action « Nouvelle carte »). Double contour : **reproduit et expliqué** (B1). Niveaux actifs sans carte : atténués et désactivés avec explication, donc corrigé. Angles = types de source : **reproduit** (A6). Niveau 3 vide et doublons video/videos/channel : **à vérifier** (A10).
- **Notes et Agent.** Cinq boutons grisés : il en reste quatre, chacun avec une info-bulle ou un `aria-disabled` explicite. Grille mal alignée : **reproduite** (B7). `[[note]]` et note vocale : **implémentés** (`noteLinks.ts`, `NoteAudio.tsx`), contrairement à la croyance. « Lancer l'agent » sans onglet : désactivé avec explication, et « Joindre l'onglet actuel » / « Tout joindre » sont présents (`AgentCanvas.tsx:264-273,314-316`).
- **Raccourcis et réglages.** « Depuis la coque » : corrigé en « depuis l'interface ». Recherche, filtrage et « Réinitialiser » : présents (26 raccourcis, 4 groupes). Personnalisation des raccourcis : **absente**, non annoncée. ⌘S pour la barre latérale : conservé et documenté ; conflit avec l'habitude « Enregistrer » à trancher. Icône de clé : « Raccourcis » utilise un clavier, « Modèles » garde une clé qui ressemble à ♂ (B6).
- **Espaces.** Ambiances Aurore / Brume / Braise : toujours proches visuellement, **à vérifier** par comparaison d'écrans ; « Nuit » existe aussi. Avatars : quatre styles (Initiales, Formes, Galerie, Photo). Teintes : **11** proposées (dix thèmes + Braise), le « six teintes » n'est plus vrai.
- **Rail et favoris.** Plafond de 12 avec tuile « +N » : présent, libellé « Tous les favoris » ; titres tronqués (B5). Réordonnancement, menu contextuel, glisser, cache de favicons par domaine, infobulle avec domaine, annonce lecteur d'écran : présents dans le code et pour partie visibles. Sites épinglés d'espace : renommage, menu contextuel et transfert présents (`SpaceShortcuts.tsx`).
- **Divers.** `app.setName('Vela')` et `productName` : présents. Icônes `.icns`, `.ico`, PNG 512 : présentes dans `build/`. Build universel macOS : configuré (`universal`, `arm64`, `x64`), non reconstruit ici. Documentation des limites (Google, extensions, synchronisation, signature) : présente dans l'aide et le README, avec une contradiction sur les mises à jour (J2).

## 9. Ce que je n'ai pas pu examiner

1. **Parcours complet dans l'app** : onboarding, création d'espace, vue scindée, téléchargements, impression, mini-fenêtre, fenêtre minimale, multi-écran. Seuls dix écrans ont été capturés.
2. **Tunnel avec des données réelles** : aucune requête de recherche lancée, pour ne pas ajouter de flux réseau. Les défauts de carte (positions, chevauchements, pastilles) restent à vérifier sur une carte réelle.
3. **Cas limites** : 200 onglets, 200 favoris, 200 nœuds, 0 onglet, réseau absent, clé invalide, fichier de données corrompu dans l'app, espace au nom vide ou très long.
4. **Accessibilité** : VoiceOver, ordre de focus complet, contrastes sur tous les thèmes et le verre dépoli, animations réduites à l'écran.
5. **Sécurité offensive** : scénario d'injection réel, validation de chaque IPC, permissions des trois OS, trousseau macOS/Windows/Linux, journaux, isolation inter-espaces, Google Sign-In.
6. **Performance** : mémoire par onglet et par espace, fluidité à 50 onglets, coût du flou, démarrage à froid sur machine réelle, taille de l'installateur.
7. **Distribution** : reconstruction d'un installateur, build universel sur Intel, signature et notarisation (aucun certificat), mise à jour réelle depuis la 0.3.15.
8. **Données anciennes** : aucune migration lancée sur un vrai profil 0.3.12 ; seuls les tests synthétiques existants.
9. **Rust** : la coque `rust/` n'a été ni compilée ni exécutée ; je ne sais pas si elle est livrée.
10. **Site** : rendu complet, SEO, performance, accessibilité, empreintes des binaires ; seul le HTML local et l'accueil publié ont été lus.
11. **Dépendances** : licences, cycles, codes morts et vulnérabilités hors `npm audit` non exhaustivement revus.

## 10. Suite proposée (phase 2, soumise à accord)

Ordre proposé : sécurité et confidentialité (D2, D3, D4, E1, E2, E3) — **fait, lot 1** —, puis pertes de données (A3, A4, A5), puis Tunnel (A6, A7, A8, A9, B1, B2), puis accueil et doublons (B3, B5, B6), puis rail et épinglés, puis notes/agent/raccourcis/espaces, puis accessibilité et textes (B4, B7, C3, G1, H1, H2), puis performance, puis build et documentation (I1, I2), puis site (J2). Chaque lot : correctifs, tests, captures avant/après, mise à jour de ce document, un commit. Aucune migration de données, suppression de fonction, mise à niveau majeure de dépendance ni réécriture de module de plus de 300 lignes sans accord spécifique. Aucune publication, aucun push, aucun tag.

## 11. Phase 2 — lot 1 : sécurité et confidentialité (fait)

### Correctifs

| Constat | Correctif | Fichiers |
|---|---|---|
| D2 | Politique d'émetteur (`shell`, `mini`, `page`, `unknown`) appliquée à chaque `ipcMain.handle` et aux `ipcMain.on` sensibles ; cadre principal exigé ; la mini-fenêtre n'atteint que `mini:*` ; le preload des pages n'atteint que quatre canaux. | `src/main/ipcPolicy.ts`, `src/main/browser.ts`, `src/main/mini.ts` |
| D3 | CSP : `script-src 'self'` + empreinte du script de thème, `connect-src` limité à la météo et au pont local. | `src/renderer/index.html` |
| D4 | Empreinte SHA-512 et taille du manifeste comparées en temps constant ; rejet et suppression du fichier en cas d'écart ; pas d'installateur sans manifeste. | `src/main/integrity.ts`, `src/main/updater.ts`, `src/shared/update.ts` |
| E1 | `isLoopbackEndpoint` / `endpointHost` ; état « Hôte distant », avertissement sous le champ, confirmation native avant d'enregistrer un endpoint distant. | `src/shared/providers.ts`, `src/main/browser.ts`, `src/renderer/src/components/SettingsPanel.tsx` |
| E2 | Clé Google dans `x-goog-api-key`, jamais dans l'URL. | `src/shared/providers.ts` |
| E3 | Trois gardes : aucun `fetch` vers une destination de lien ouvert, liste revue des fichiers appelant `fetch`, tout hôte déclaré présent dans le code. | `src/shared/network.ts`, `src/shared/network.test.ts` |
| E4 | Métadonnées inévitables nommées pour le CDN OCR et Letterboxd. | `src/shared/network.ts` |
| A1, A2, D1 | Correctifs préexistants, désormais commités avec leurs tests. | `src/main/notes.ts`, `src/main/store.ts`, `src/main/agent.ts` |

Textes alignés : `site/tools/privacy.template.html`, `site/tools/privacy.mjs` et la page publiée `site/public/confidentialite/index.html`, régénérée depuis `NETWORK_FLOWS` (13 flux, 39 hôtes). Aucune nouvelle destination réseau n'a été ajoutée ; le manifeste `latest-mac.yml` est lu sur `github.com`, déjà déclaré.

### Vérifications

| Vérification | Commande ou moyen | Résultat |
|---|---|---|
| Types | `npm run typecheck` | code 0 |
| Tests | `npm test` | **34 fichiers, 357 tests réussis**, code 0 (336 au départ) |
| Build | `npm run build` | code 0 ; 1,9 Mo dans `out/` |
| CSP à l'exécution | harnais CDP, `securitypolicyviolation` | aucune violation ; interface fonctionnelle (réglages, notes, agent, tunnel) |
| Endpoint distant | harnais CDP sur l'app réelle | avertissement affiché avec l'hôte ; aucun envoi déclenché |
| Journal renderer | harnais CDP | aucune exception, aucune erreur console |
| Page Confidentialité | `node site/tools/privacy.mjs` + comparaison avec la version publiée | seules les phrases voulues changent |

Captures : [avant, endpoint distant](screenshots/lot1-avant-endpoint-distant.png) · [après, endpoint distant](screenshots/lot1-apres-endpoint-distant.png) · [avant, confidentialité](screenshots/lot1-avant-confidentialite.png) · [après, confidentialité](screenshots/lot1-apres-confidentialite.png).

### Restes ouverts de ce lot

- La mini-fenêtre charge encore `preload/index.js` ; elle n'atteint plus que `mini:*`, mais un pont dédié réduirait la surface exposée à zéro.
- La signature Developer ID et la notarisation ne peuvent pas être vérifiées sans certificat ; l'empreinte protège l'intégrité du téléchargement, pas l'identité de l'éditeur.

## 12. Phase 2 — lot 2 : pertes de données (fait)

### Correctifs

| Constat | Correctif | Fichiers |
|---|---|---|
| A1 | Un index de notes illisible n'est plus lu comme une liste vide : l'app refuse de démarrer plutôt que de purger des enregistrements, et toute écriture de note est bloquée tant que les fichiers ne sont pas restaurés. | `src/main/notes.ts`, `src/main/browser.ts` |
| A2 | Un `vela.json` illisible lève au démarrage : le fichier d'origine reste intact et aucune sauvegarde ne l'écrase. | `src/main/store.ts` |
| A3 | La clé héritée n'est supprimée qu'après relecture de `secrets.json` ; chiffrement indisponible, clé illisible ou écriture ratée laissent `secret.bin` en place. Une clé existante n'est jamais écrasée par une clé héritée non attribuable. | `src/main/store.ts` |
| A4 | Renommage : le fichier et l'index sont écrits avant les notes liées ; un index non écrit remet le fichier en place, et les liens non réécrits sont comptés puis annoncés. | `src/main/notes.ts`, `src/renderer/src/components/NotesDrawer.tsx`, `src/shared/types.ts` |
| A5 | La vingt-et-unième carte est refusée au lieu d'évincer la plus ancienne : booléen remonté par le stockage, `done.saved` pour un tunnel, refus de la copie, et message dans l'interface. | `src/main/store.ts`, `src/main/tunnel.ts`, `src/shared/tunnel.ts`, `src/shared/api.ts`, `src/renderer/src/store/tunnel.ts`, `src/main/browser.ts` |

### Vérifications

| Vérification | Commande ou moyen | Résultat |
|---|---|---|
| Types | `npm run typecheck` (arbre et état indexé isolé) | code 0 dans les deux |
| Tests | `npm test` | **35 fichiers, 368 tests réussis** (357 avant ce lot) ; état indexé isolé : 34 fichiers, 352 tests |
| Plafond des cartes, avant | app réelle construite sur `4eab77a` | 21e carte acceptée ; plus ancienne évincée (`oldest: carte-1`, `hasOverflow: true`) |
| Plafond des cartes, après | app réelle reconstruite | 21e refusée (`{ ok: false }`) ; 20 cartes, plus ancienne intacte (`oldest: carte-0`) |
| Renommage de note, app réelle | CDP : deux notes liées, renommage | `updated: 1`, `linksFailed: 0`, lien réécrit, graphe entrant cohérent |
| Journal renderer | harnais CDP | aucune exception |

Captures (clair et sombre) : [avant](screenshots/lot2-avant-cartes-clair.png) · [après](screenshots/lot2-apres-cartes-clair.png) · [avant, sombre](screenshots/lot2-avant-cartes-sombre.png) · [après, sombre](screenshots/lot2-apres-cartes-sombre.png). La première ligne de la liste dit tout : avant, « Sujet 20 » a pris la place de « Sujet 0 » ; après, « Sujet 20 » n'existe pas et « Sujet 19 » reste en tête.

### Restes ouverts de ce lot

- Une clé héritée impossible à attribuer (fournisseur actif déjà pourvu) reste sur le disque, sans interface pour la récupérer : rien n'est perdu, mais rien ne l'explique non plus.
- Le renommage n'a pas de reprise après interruption entre l'écriture de la note et celle des notes liées : l'état reste lisible, les liens peuvent être anciens.
- Les échecs d'écriture ne sont testés qu'avec un fichier en lecture seule, donc ignorés si les tests tournent en root (garde `skipIf`).
