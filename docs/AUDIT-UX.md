# Audit ergonomie, animation et performance

Date : 31 octobre 2026. Version : 0.3.16 (`main`, arbre de travail). Plateforme des mesures :
macOS arm64, Electron 45, fenêtre 1440 × 900 puis 1280 × 800 pour les cas de mise en page.
Périmètre : l'application de bureau (`src/renderer`, `src/main`, `src/shared`), pas le site vitrine.

## Méthode

L'app a été **lancée réellement**, avec un profil de données isolé, et pilotée par le protocole
DevTools (mêmes outils que `site/trailer/lib.cjs`) : souris et clavier en événements d'entrée,
captures par le compositeur Chromium, mesures `Performance.getMetrics` et
`document.getAnimations()`. Les chiffres ci-dessous viennent de ces mesures, pas d'une lecture du
code seule. Les cas marqués **non vérifié** n'ont pas de preuve d'exécution et sont signalés comme
tels.

## Ce qui est déjà bon — à ne pas casser

- **Mouvement réduit respecté** : avec `prefers-reduced-motion: reduce`, `document.getAnimations()`
  rend **0** animation. Les 20 blocs CSS dédiés font leur travail.
- **Repos fluide** : 90 images mesurées, médiane 16,7 ms, p95 17,7 ms, **0 longue tâche**, et
  **5 ms** de temps principal sur 4 s à l'accueil malgré 3 animations infinies. Le coût des
  animations d'ambiance est donc négligeable sur cette machine ; il ne faut pas les supprimer par
  principe, seulement éviter d'en ajouter qui repeignent.
- **Chargement paresseux** des panneaux (`App.tsx:11-21`) et des vues lourdes (`Workspace.tsx:13`),
  état de chargement et états vides présents (Notes, historique, favoris, téléchargements, tunnel).
- **Déplacement d'onglets et de favoris au clavier** (Alt + flèches), annonces `aria-live`,
  réordonnancement qui rend le focus à l'élément déplacé.
- Palette ⌘K : focus bien placé dans le champ, navigation ↑/↓, Échap, 24 résultats, groupes clairs.
- Vue scindée : poignée de 9 px, double-clic pour revenir à 50/50, ratio mémorisé.

---

## 1. Priorité haute — à corriger en premier

### P0.1 — Agent + Notes ouverts ensemble écrasent la page

**Constat.** `App.tsx:124-125` monte les deux panneaux en même temps. Ce sont des éléments flex à
largeur fixe : rail 68 px, barre latérale 276 px, notes 400 px, agent 420 px. **Mesuré à 1280 px :
la zone de travail tombe à 116 px**, le tiroir Notes chevauche l'agent et la page devient
inutilisable. Capture : [audit-ux-panneaux-1280.png](captures/audit-ux-panneaux-1280.png).

**Correctif.** Une seule surface annexe à la fois (ouvrir l'agent ferme les notes, et
réciproquement), plus une largeur minimale pour la page (~480 px). Sous ce seuil, le panneau passe
en superposition (`position: absolute`) au lieu de comprimer la scène. C'est le correctif le moins
risqué ; l'alternative (réduire automatiquement la barre latérale) ne suffit pas à 1280 px.

### P0.2 — Les dernières frappes d'une note sont perdues quand on change de note

**Constat.** L'enregistrement est différé de 600 ms (`NotesDrawer.tsx:120-159`). `openNote`
(`NotesDrawer.tsx:236`) remplace le brouillon sans vider ce délai, puis `setDirty(false)`. Le
nettoyage de l'effet annule le minuteur : **tout ce qui a été tapé dans les 600 ms précédentes
disparaît**. Le même défaut touche `newNote` et la capture de page, qui remplacent le brouillon
sans condition.

**Correctif.** Avant de changer de note, si `dirty`, appeler immédiatement la même fonction de
sauvegarde (ou exposer un `flush()` qui annule le minuteur, enregistre et attend le résultat). Le
nettoyage au démontage existe déjà (`NotesDrawer.tsx:161-176`) : le même chemin peut servir.

### P0.3 — Les panneaux modaux ne prennent pas le focus et ne le retiennent pas

**Constat.** Réglages, brief, historique, favoris, protection, téléchargements, processus sont des
`role="dialog"` **sans `aria-modal`, sans `inert` sur l'arrière-plan, sans déplacement ni piège de
focus**. Mesuré en ouvrant les réglages au clic : le focus reste sur `BUTTON.rail-ghost` derrière
la feuille ; après 4 Tab, il est sur `BUTTON.icon-btn subtle` de la barre latérale, toujours
derrière. Clavier et lecteur d'écran continuent donc de parcourir la page masquée.

**Correctif.** Un petit composant commun (`<Sheet>`) qui, à l'ouverture : mémorise
`document.activeElement`, pose `aria-modal="true"`, déplace le focus sur le titre ou le premier
contrôle, piège Tab/Shift+Tab, pose `inert` sur `.app` (sauf la feuille), et rend le focus au
déclencheur à la fermeture. La palette a déjà la bonne partie (focus initial) ; il reste à
factoriser.

### P1.1 — Les actions d'onglet invisibles restent dans l'ordre de tabulation

**Constat.** `.tab-actions` est à `opacity: 0` et ne devient visible qu'au survol ou sur l'onglet
actif (`styles.css:826-836`), mais les trois boutons restent focalisables. **Mesuré : 3 boutons
masqués tabulables par onglet** (« Épingler », « Ouvrir en vue scindée », « Fermer »), cibles de
**20 × 20 px** (`styles.css:838-843`). Sur 10 onglets, 30 arrêts de tabulation sans repère visuel.

**Correctif.** Les révéler aussi au clavier (`.tab-row:focus-within .tab-actions { opacity: 1 }`)
et leur donner une zone cliquable de 24-28 px sans agrandir l'icône. À défaut, `visibility:
hidden` au repos rend les boutons non focalisables, mais supprime l'accès clavier : préférer
`focus-within`.

**À corriger en même temps.** La ligne d'onglet porte `role="tab"` (avec trois boutons à
l'intérieur) sans `role="tablist"` ni `tabpanel` : la sémantique ARIA est incomplète et des
contrôles interactifs sont imbriqués dans un `tab`. Soit une vraie paire `tablist`/`tabpanel`
avec navigation par flèches, soit un simple bouton de liste (`role="button"` ou `<button>`) et
`aria-current`.

### P1.2 — Le survol d'un onglet affiche deux infobulles et un faux aperçu

**Constat.** `TabRow.tsx:113` pose `title={tab.title}` sur toute la ligne ; au bout d'environ une
seconde Chromium affiche son infobulle native **en plus** de la carte maison qui apparaît à 280 ms
(`TabRow.tsx:60-70`). La carte, elle, n'affiche pas un aperçu de la page : `TabPreviewCard.tsx:69`
met le **favicon** dans le cadre prévu pour une capture, d'où l'icône « image cassée » agrandie
visible sur les captures. Et `preview-url` (`:94`) puis `preview-host` (`:96`) affichent deux fois
le même domaine (`example.com/` puis `example.com`). Capture :
[audit-ux-apercu-onglet.png](captures/audit-ux-apercu-onglet.png).

**Correctif.** Retirer l'attribut `title` de la ligne (les noms accessibles sont déjà sur les
boutons et la carte), ou remplacer l'infobulle native par la carte. Dans la carte : soit une vraie
vignette (le cache `thumbs` existe déjà pour l'historique), soit aucun cadre média. Garder une
seule ligne d'adresse.

### P1.3 — L'inclinaison des tuiles de l'accueil coûte cher au pointeur

**Constat.** `StartPage.tsx:238-272` : chaque `pointermove` écrit 2 variables CSS sur le fond et 3
sur la tuile, sans regroupement par image. **Mesuré sur ~5,8 s de déplacement continu : 2061 ms de
temps du fil principal et 1230 ms de recalcul de style**, soit environ un tiers de ce fil occupé
pendant le survol. À comparer aux 5 ms de la même page au repos : c'est le seul poste chaud mesuré.

**Correctif.** Accumuler la position dans une variable, n'écrire qu'une fois par
`requestAnimationFrame`, et retirer la `transition` de 480 ms pendant le déplacement (elle redémarre
à chaque événement). Pour la tuile, la parallaxe doit rester un `transform` (rotation + reflet),
jamais une propriété qui invalide la mise en page.

### P1.4 — Les deux pages disparaissent pendant le glissement de la vue scindée

**Constat.** `startDrag` (`Workspace.tsx:188-205`, masquage ligne 197) envoie immédiatement `views.layout({ panes: [] })` :
les vues natives sont retirées et remplacées par le « ghost » (titre + hôte sur fond pointillé).
Pendant tout le glissement, l'utilisateur ne voit plus les pages qu'il redimensionne — cela se lit
comme un plantage. Capture : [audit-ux-pendant-glissement.png](captures/audit-ux-pendant-glissement.png).

**Correctif.** Garder les vues visibles et ne renvoyer la disposition qu'une fois par image, en
ignorant les écarts inférieurs à 2 px. Si le redimensionnement des vues natives est trop coûteux,
conserver le ghost mais **assumé** : afficher les deux pages en réduction figée (capture) ou une
ligne d'accent avec « Relâchez pour appliquer », pas un fond vide.

### P1.5 — La palette ne classe pas les résultats et n'ouvre pas la note choisie

**Constat.** Les résultats sont filtrés puis tronqués dans l'ordre de construction
(`CommandBar.tsx:449-456`), sans score. Taper « Hébergement » place **4e** la note « Hébergement
statique », derrière trois commandes génériques. Et la commande d'une note ne fait qu'ouvrir le
tiroir (`CommandBar.tsx:415-420`) : elle n'ouvre pas la note, contrairement à ce qu'annonce la
ligne. Même défaut pour le groupe Notes en général.

**Correctif.** Un score simple : correspondance exacte du titre > préfixe > mot > sous-chaîne, avec
bonus pour les onglets et les notes récentes ; trier avant `slice(0, 24)`. Ajouter une action
`openNote(id)` au store et l'appeler depuis la palette.

### P1.6 — Le zoom n'a aucun retour visuel ni mémoire

**Constat.** `tabs.ts:534-540` change le niveau de zoom, mais rien ne l'affiche. `⌘+`, `⌘-`, `⌘0`
sont dans le menu et dans la page Raccourcis, sans indicateur. **Mesuré : la barre d'état reste
absente après un zoom.** Le niveau n'est pas enregistré par site : il est perdu au rechargement de
l'onglet ou au redémarrage.

**Correctif.** Afficher brièvement « 125 % » dans la barre d'état (elle existe déjà et disparaît
seule), et mémoriser le zoom par origine dans l'état de l'espace. Au minimum, `⌘0` doit être
découvrable ailleurs que dans les raccourcis.

### P1.7 — Fonctions de navigation attendues absentes

Constat par lecture de `tabs.ts` et `browser.ts` (aucune occurrence) :

- **Pas de changement d'onglet au clavier** : ni `⌃Tab`, ni `⌘⇧[` / `⌘⇧]`. Seul `⌘1…9` existe
  (`browser.ts`, `tab-select`). C'est le raccourci le plus utilisé d'un navigateur.
- **Pas de clic droit sur un onglet non épinglé** : `TabRow` n'a pas de `onContextMenu` ; seules
  les épingles et les favoris ouvrent `TileMenu`. Un onglet ne propose donc ni « Fermer les
  autres », ni « Dupliquer », ni « Copier l'adresse ».
- **Menu de page incomplet** (`tabs.ts:395-440`) : sur une image, sans sélection ni lien, le menu
  est vide. Absents aussi : « Copier l'adresse de la page », « Ajouter aux favoris », « Enregistrer
  l'image », « Inspecter ».
- **Pas de boutons souris précédent/suivant** (boutons 4 et 5) : aucun écouteur de bouton
  auxiliaire, et aucun gestionnaire `app-command` / geste n'est branché.

**Correctif.** Ajouter les deux actions `next-tab` / `prev-tab` dans `ShortcutAction`, les lier à
`⌃Tab` et `⌘⇧[`/`]`, compléter le menu contextuel de `TabRow` avec les actions déjà présentes dans
le store, et ajouter trois entrées au menu de page.

---

## 2. Animations

| Constat | Preuve | Recommandation |
| --- | --- | --- |
| **Aucune animation de sortie** : les panneaux sont montés conditionnellement et démontés d'un coup (`App.tsx:124-138`), alors que 28 `@keyframes` d'entrée existent. Ouvrir/fermer les réglages n'a donc pas le même rythme. | Lecture + captures | Soit assumer l'instantané et retirer l'entrée (plus cohérent), soit ajouter un état `closing` de 120-160 ms avant démontage. Un hook `usePresence` de 20 lignes suffit, ou `transition-behavior: allow-discrete` sur Electron 45. |
| **Le survol d'un onglet a deux animations concurrentes** : carte à 280 ms, infobulle native à ~1 s. | `TabRow.tsx:60-70`, `:113` | Voir P1.2. |
| **Animations d'ambiance coûteuses en surface** : 3 `aurora-blob` en `blur(64px)` qui dérivent 28-34 s, plus le ciel de braise (canvas rAF permanent) quand le thème est actif. | `styles.css:10868-10905`, `DragonSky.tsx` | Le coût au repos mesuré est négligeable : ne pas les retirer. En revanche, ne pas les cumuler avec d'autres couches floutées, et garder la pause sur `document.hidden` (déjà faite). |
| **Inclinaison/parallaxe non regroupée** | P1.3 | Regrouper par image. |
| **`will-change: transform` permanent** sur `.aurora-field`, `.dragon-drift`, `.dragon-flight` (`styles.css:10868`, `15278`, `15287`) | Lecture | À garder uniquement quand la couche est visible (déjà le cas pour le ciel) ; sinon le laisser, le coût mesuré est nul ici. |
| **Annonces et mouvements** : `prefers-reduced-motion` est respecté, mais pas la préférence « moins de transparence » | `document.getAnimations()` = 0 en mode réduit | Ajouter `prefers-reduced-transparency` pour couper les `backdrop-filter` : utile sur les machines lentes et cohérent avec le réglage « Intensité du verre ». |

## 3. Transitions

- **Durées et courbes dispersées** : 140, 160, 170, 180, 200, 320, 340, 480 ms, `ease`, `ease-out`,
  trois `cubic-bezier` différents, et un jeton `--ease-spring` **jamais utilisé** (`styles.css:3926`).
  Les jetons `--dur-1…3` existent mais ne couvrent qu'une petite partie des 155 `transition:`.
  **Correctif** : une échelle unique (120 ms retour, 200 ms ouverture, 320 ms entrée de page) et
  deux courbes (sortie, ressort). C'est mécanique et sans risque visuel.
- **Pas de transition entre onglets** : la page native apparaît et le « ghost » disparaît sans
  fondu. Un fondu de 120 ms du chrome (titre, favicon) suffirait ; le contenu natif ne peut pas être
  animé sans coût, donc ne pas le tenter.
- **Ouverture/fermeture de la barre latérale** : démontage instantané (`App.tsx:122`), la scène se
  réagence d'un coup. L'animer en largeur coûterait une mise en page par image ; préférer un fondu
  de 100 ms ou ne rien faire.
- **Tiroir Notes** : `animation: fade 0.18s` à l'ouverture (`styles.css:3013`), rien à la fermeture,
  et la page se réagence brutalement. Même arbitrage que ci-dessus.
- **Barre d'état** : apparaît/disparaît sans transition alors qu'elle flotte au-dessus de la page.
  Un `opacity` + `translateY` de 140 ms est sans coût.
- **Toasts** : entrée animée, sortie instantanée (`styles.css:3971`), alors qu'ils portent parfois
  une action (« Annuler »). Ajouter une sortie de 120 ms pour éviter le clignotement.

## 4. Optimisation du code

- **`styles.css` : 16 240 lignes, 2 127 règles, 310 kB.** Trois blocs `.overlay`, cinq blocs
  `.notes-drawer`, trois `.tab-row`, trois `.toast`, deux `.sheet`. Ces doublons expliquent les
  corrections en cascade (le `backdrop-filter` de `.overlay` est redéfini deux fois). **Correctif** :
  fusionner les blocs par composant, sans réécrire le design. À faire par lots, avec captures
  avant/après.
- **`stableView` stringifie chaque clé de l'état à chaque diffusion** (`store/browser.ts:32-47`) :
  `JSON.stringify` sur `tabs`, `bookmarks`, `history`, `notes`, `tasks`, `works` à chaque
  `state:changed` (throttlé à 120 ms, `browser.ts:374-380`). Non mesuré isolément, mais c'est du
  travail évitable : comparer les références des grands tableaux (le processus principal les
  recrée à chaque `view()`, donc cela ne suffira pas) ou ne diffuser que les clés modifiées.
  Mesurer avant de changer : le gain est probablement faible, la complexité réelle.
- **`BriefPanel.tsx:25-31` décide de l'action d'après le texte français** (`/espace/i`,
  `/rapport|agent/i`). Toute reformulation casse le comportement. **Correctif** : un champ
  `action` typé dans `BriefItem`, décidé par `buildBrief`.
- **Pas de `any` ni de `@ts-ignore`** ; les commentaires expliquent les arbitrages. La dette est
  surtout la taille des fichiers (SettingsPanel 1 467, NotesDrawer 1 342, styles 16 240).

## 5. Performances — mesures

Environnement : macOS arm64, build de développement de l'arbre courant.

| Scénario | Mesure | Lecture |
| --- | --- | --- |
| Accueil au repos, 4 s | 5 ms de tâche, 0 ms layout/recalc | Rien à optimiser. |
| Images au repos (90 images) | médiane 16,7 ms, p95 17,7 ms, 0 longue tâche | 60 fps. |
| Mouvement réduit, 4 s | 0 animation, 26 ms de tâche | Très bon. |
| Survol/inclinaison des tuiles, ~5,8 s | 2 061 ms de tâche, 1 230 ms de recalcul de style | **Poste chaud** (P1.3). |
| Premier rendu de l'accueil | 372 nœuds DOM, 2 194 règles CSS, 13 `backdrop-filter`, 8 animations dont 3 infinies | Correct, mais 13 flous empilés. |
| Deux panneaux à 1280 px | page = 116 px | **Cassé** (P0.1). |

- **13 `backdrop-filter` à l'accueil**, dont `.home-card` (`styles.css:11184`), `.home-pins`
  (`12890`), `.pin-card` (`13021`), `.mini-tile` (`13322`), `.brief-item` (`4499`),
  `.tab-row[data-active]` (`4311`) et `.status-bar` (`6799`) — tous posés sur un fond **opaque**
  (`--paper`). Le flou y est invisible mais chaque élément paie un passage de blur et une couche de
  composition. **Correctif** : garder le verre sur le chrome et les surfaces flottantes
  (`.rail::before`, `.overlay`, `.pane-head`, `.tab-preview-card`, `.toast`, `.notes-drawer`) et
  retirer `backdrop-filter` des cartes opaques. C'est le gain le plus probable sans risque visuel ;
  il doit être mesuré après coup, je ne l'avance pas chiffré.
- **`Suspense fallback={null}`** autour des panneaux (`App.tsx:123`) : si le chunk met du temps, le
  clic sur Réglages ne montre rien pendant un instant. Un squelette de 100 ms ou un spinner discret
  dans le panneau vaudrait mieux qu'aucun retour.
- **Les vues natives sont retirées** dès qu'un panneau s'ouvre (`Workspace.tsx:125-130`) puis
  réinstallées à la fermeture : c'est ce qui produit le fond flouté sans page sous les réglages.
  C'est acceptable, mais la réapparition n'a aucun fondu : voir Transitions.

## 6. Sections et architecture de l'information

- **Vocabulaire flottant.** Le même objet porte trois noms : « Brief du jour » (palette, réglages,
  onboarding), « Reprendre le fil » (sidebar, titre du panneau), « Reprendre » (puce d'accueil). Le
  mode de travail s'appelle « Travail » (rail, menu, palette), « Atelier » (agent embarqué) et
  « Travaux » (liste des rapports) — trois notions proches pour trois endroits différents.
  **Correctif** : un nom par objet. Proposition : **Brief** (partout), **Atelier** (le mode),
  **Rapports** (les productions).
- **« Personnaliser » en double sur l'accueil** : bouton d'en-tête (`StartPage.tsx:296`) et lien de
  pied de page (`StartPage.tsx:514`) qui font exactement la même chose. En garder un.
- **Le brief est accessible de trois endroits** (carte de la sidebar, puce « Reprendre », palette
  `⌘K`) plus le menu. Deux suffisent ; la carte de la sidebar est la plus utile.
- **Ordre de l'accueil** : date → personnaliser → salutation → météo → recherche → sites épinglés →
  récents → tâches/notes. La météo occupe le coin le plus visible (haut droite) avec une ville à
  configurer, alors que c'est l'élément le moins lié au travail. À rendre optionnel par défaut
  (le module l'est déjà : le désactiver par défaut pour les nouveaux profils, ou le placer sous la
  recherche).
- **Réglages** : 7 sections cohérentes. Manquent deux choses attendues dans un navigateur : le
  **zoom par défaut** (il n'existe qu'en raccourci) et les **autorisations par site** (caméra,
  micro, notifications) — aujourd'hui refusées par défaut sans interface pour les accorder.
- **Barre latérale** : les Favoris et les Onglets ont chacun un compteur et des outils ; les
  Téléchargements n'ont pas d'entrée (uniquement la barre d'état quand il y en a, ou la palette).
  Acceptable, mais une entrée stable éviterait de chercher.

## 7. Fonctionnalités manquantes (par ordre d'utilité)

1. **Changement d'onglet au clavier** (`⌃Tab`, `⌘⇧[`/`]`) — P1.7.
2. **Menu contextuel complet sur les onglets et la page** — P1.7.
3. **Indicateur de zoom et mémorisation par site** — P1.6.
4. **Recherche/commande qui ouvre la note** et classe les résultats — P1.5.
5. **Boutons souris précédent/suivant** (boutons 4 et 5) : deux écouteurs, très attendu sur souris
   de bureau.
6. **Mode lecture** : absent. Utile pour un navigateur de travail, mais c'est un chantier à part
   (extraction + CSS de lecture) ; à planifier, pas à glisser dans un lot de finition.
7. **Autorisations par site** : sans interface, un site qui demande le micro restera bloqué sans
   explication.

## 8. Finitions visibles sur les captures

- **Typographie sous 11 px** : **11 nœuds de texte** de l'accueil ont une taille calculée
  inférieure à 11 px. Les feuilles descendent à 9 px (`.section-count`, `styles.css:1449`),
  9,5 px (titres de sections) et 10,5 px (`.tile-badge`, `styles.css:11352`). Le plancher demandé
  par l'audit précédent n'est pas appliqué.
- **Tuiles « Récemment »** : trois lignes d'information dans 10,5-12 px sur une tuile d'environ
  180 px,
  avec l'hôte tronqué (« develope… », « news.ycombi… ») **et** la pastille « Favori/Raccourci » sur
  la même ligne : le texte porteur d'information est le plus petit de la carte. Simplifier en
  favicon + titre sur deux lignes, hôte en infobulle, badge seulement s'il apporte quelque chose.
- **Barre d'état** : pastille flottante en bas au centre, au-dessus du contenu ; sur l'accueil elle
  chevauche le pied de page quand la fenêtre est basse. La réserver aux pages, ou la décaler.
- **Contraste et focus** : 43 règles `:focus-visible` existent, mais aucun anneau n'est visible sur
  les panneaux ouverts (le focus est resté derrière). Une fois P0.3 corrigé, vérifier l'anneau sur
  fond de verre dans les deux thèmes.

## 9. Ce qui n'a pas été vérifié

- Le comportement des **infobulles natives** n'est pas capturable par CDP : le double affichage est
  déduit de l'attribut `title` et du délai de la carte, pas observé à l'écran.
- **Mémoire et processeur sur une longue session** (50 onglets, 200 favoris, 200 nœuds de tunnel) :
  non mesurés. Les chiffres ci-dessus valent pour un profil neuf.
- **Coût GPU réel** des flous et du ciel de braise : le temps principal est négligeable, le coût
  énergétique n'a pas été instrumenté.
- **Windows et Linux** : non exécutés ; les raccourcis du menu n'y sont pas déclarés
  (`menu.ts:9-20`, `registerAccelerator: false` réservé à macOS), donc le menu natif n'affiche pas
  les combinaisons.
- **Lecteur d'écran** : parcours non mené ; seules les structures (`role`, `aria-label`,
  `aria-live`) ont été inspectées.

## 10. Ordre de travail proposé

| Lot | Contenu | Effet |
| --- | --- | --- |
| 1 | P0.1 panneaux, P0.2 note perdue, P0.3 focus des feuilles, P1.1 actions masquées | Corrige les blocages et les pertes de données. |
| 2 | P1.2 aperçu d'onglet, P1.5 palette, P1.6 zoom, P1.7 raccourcis et menus contextuels | Rend le navigateur complet au quotidien. |
| 3 | P1.3 survol, P1.4 glissement scindé, retrait des flous opaques | Fluidité et cohérence. |
| 4 | Transitions (échelle de durées, sorties), vocabulaire, dédoublonnage de l'accueil | Finition perceptible. |
| 5 | Découpage de `styles.css` et des gros composants | Dette, à faire sans changement visuel. |

Chaque lot doit être mesuré avec la même méthode (images, `Performance.getMetrics`, captures) :
aucun gain ne doit être annoncé sans chiffre avant/après.

## Suivi — lot 1 livré le 31 octobre 2026

Les quatre blocages de priorité haute sont corrigés dans l'arbre de travail.

| Point | Changement | Vérification à l'exécution |
| --- | --- | --- |
| P0.1 panneaux | Notes et agent s'excluent dans le store (`toggleNotes`, `toggleAgent`, `openAgent`, sélection de page) ; sous 1180 px, le panneau ancré se resserre à 340 px au lieu de comprimer la page. | 1280 px : notes seules → page 536 px ; agent seul → 516 px ; l'un ferme l'autre. 1024 px : agent 340 px, page 340 px. |
| P0.2 note perdue | La sauvegarde différée passe par `persistDraft`, et `flushPending` la vide avant d'ouvrir une note, d'en créer une, de capturer la page ou de revenir à la liste. Une version de brouillon empêche un enregistrement tardif d'écraser la note suivante. | Texte tapé puis « Retour aux notes » en 192 ms : le texte est présent à la réouverture. Note neuve quittée aussitôt : créée avec son contenu (3 notes). |
| P0.3 focus | `useModalFocus` : focus placé dans la feuille, Tab/Shift+Tab piégés, focus rendu au déclencheur. Appliqué aux réglages, brief, historique, favoris, protection, téléchargements, processus, palette, dialogue d'espace et onboarding ; `aria-modal="true"` ajouté. | Réglages : focus sur le premier contrôle, toujours dans la feuille après 8 Tab, revient sur le bouton du rail à Échap. Brief : focus dans la feuille. |
| P1.1 actions masquées | `.tab-row:focus-within` et `.group-head:focus-within` révèlent les actions ; cible portée de 20 à 24 px. | Onglet focalisé : actions à opacité 1 ; Tab suivant sur « Épingler », visible. |

Vérifications : `npm run typecheck` (code 0), `npm test` (37 fichiers, 384 tests), `npm run build` (code 0), puis
les mesures ci-dessus dans l'app réelle. Les autres points de l'audit restent ouverts.

## Suivi — lot 2 livré le 31 octobre 2026

| Point | Changement | Vérification à l'exécution |
| --- | --- | --- |
| P1.2 aperçu d'onglet | La ligne d'onglet n'a plus d'attribut `title` : une seule surface d'aperçu. La carte affiche une **vraie vignette** du cache `thumbs` quand elle existe, sinon aucun cadre média — fini le favicon agrandi qui passait pour une capture. Une seule ligne d'adresse (`example.com`), plus de domaine répété. La carte est portée dans `document.body` (le fond filtré de la barre latérale la rognait) et se place sous la liste d'onglets : les pages vivant dans des vues natives, au-dessus du rendu de la coque, une carte posée sur la page serait invisible. Le délai de fermeture passe à 420 ms pour laisser la rejoindre. | Survol d'un onglet : carte présente, `urlLines: 1`, `hostLines: 0`, `media: false` (vignettes désactivées par défaut), aucun `title` sur la ligne. Capture : `captures/lot2-apercu-onglet.png`. |
| P1.5 palette | `lib/commandRank.ts` : score titre exact > préfixe > mot > sous-chaîne > indice, bonus onglets/notes, groupes contigus ordonnés par leur meilleur résultat, tri stable. La commande d'une note appelle `requestNote(id)` et le tiroir ouvre **cette** note. | Requête « hebergement » : groupe **Notes** en tête, « Hébergement statique » premier devant « Ouvrir « hebergement » » et la commande d'agent ; Entrée ouvre le tiroir sur la note (titre « Hébergement statique »). Captures : `captures/lot2-palette.png`, `captures/lot2-note-depuis-palette.png`. Tests : `commandRank.test.ts`, 6 cas. |
| P1.6 zoom | `tabs.zoom` rend le nouveau niveau ; le store le convertit en pourcentage et l'affiche dans la barre d'état, cliquable pour revenir à 100 %. Les raccourcis de zoom fonctionnent aussi quand la coque a le focus. | ⌘/Ctrl + dans la barre d'adresse : « 110 % » apparaît (`aria-label` « Zoom 110 pour cent, revenir à 100 % »), puis disparaît seul ; `.status-zoom` absent après 2,1 s. Capture : `captures/lot2-zoom.png`. |
| P1.7 raccourcis | `next-tab` / `prev-tab` ajoutés : ⌃Tab, ⌃⇧Tab, ⌃Page↑/↓ dans les pages (processus principal), et depuis la coque (⌃Tab, ⌘⇧[ / ⌘⇧]). Entrées « Onglet suivant / précédent » dans le menu Fenêtre. | Depuis la coque : Accueil → ⌃Tab → example.com → ⌃⇧Tab → Accueil → ⌃⇧] → example.com. Aucun accroc. |
| P1.7 menus | Clic droit sur un onglet : épingler, dupliquer, vue scindée, son, copier l'adresse, copier le titre, fermer, fermer les autres — aussi au clavier (touche Menu, ⇧F10), avec navigation par flèches et Échap. Menu de page complété : copier l'adresse, ajouter aux favoris, recharger, mini navigateur, enregistrer l'image, copier l'adresse du lien, inspecter. Le menu ne reste plus vide sur une image. | Onglet : 8 entrées, focus sur la première ; menu complet sur un onglet de page comme sur l'accueil. Captures : `captures/lot2-menu-onglet.png`. |

**Limites de vérification.** Les menus natifs (menu de page Electron, accélérateurs de menu) ne sont pas
observables par CDP : ils sont vérifiés par lecture et typecheck, pas à l'exécution. La carte d'aperçu
ne peut pas flotter au-dessus d'une page native (contrainte de composition d'Electron) ; c'est pourquoi
elle vit dans la barre latérale, sous la liste.

**Fichiers.** `store/browser.ts`, `components/CommandBar.tsx`, `components/NotesDrawer.tsx`,
`components/StatusBar.tsx`, `components/TabRow.tsx`, `components/TabPreviewCard.tsx`, `App.tsx`,
`styles.css`, `lib/commandRank.ts`, `main/tabs.ts`, `main/menu.ts`, `shared/api.ts`, `shared/types.ts`.
Vérifications : `npm run typecheck` (code 0), `npm test` (38 fichiers, 390 tests), `npm run build` (code 0).

## Suivi — lot 3 livré le 31 octobre 2026

Même méthode que les lots précédents : l'app réelle, profil `VELA_USER_DATA` isolé, fenêtre
1380 × 880, `Performance.getMetrics` lus avant et après chaque scénario, captures par le
compositeur Chromium. Les deux mesures du survol ont été prises sur le **même profil** (onboarding
passé, trois tuiles « Récents »), l'une avec le code du lot 2 remis en place pour la circonstance,
l'autre avec le code livré : les chiffres ne mélangent pas deux environnements.

| Point | Changement | Mesures avant → après |
| --- | --- | --- |
| P1.3 survol de l'accueil | Les variables de l'aurora sont écrites sur `.home-aurora` et non plus sur `.start` : elles n'invalident plus tout l'arbre qui les héritait. Une seule lecture de rectangle et une seule écriture par image (`requestAnimationFrame`), l'inclinaison ne touche que la tuile survolée, et `data-pointing` coupe les transitions de `transform` pendant le geste — elles redémarraient à chaque image. | 5,8 s de déplacement continu, 349 événements : temps du fil principal **1 365,7 → 717,1 ms** (−47 %), recalcul de style **866,5 → 241,6 ms** (−72 %), mises en page **14 → 5**. |
| P1.4 glissement scindé | Les vues natives ne peuvent pas rester à l'écran pendant le geste : posées au-dessus de la coque, elles prendraient le pointeur et le glissement s'arrêterait à la première image (limite d'Electron, cf. `electron#45027` / `#49039`). Le fond pointillé est donc remplacé par une **épreuve figée** de chaque page, capturée avant le retrait des vues (`views:snapshot`), avec une ligne d'accent et l'étiquette « 57 / 43 · relâchez ». Le partage s'écrit directement dans la variable CSS une fois par image ; il n'est enregistré qu'au relâchement, et aucune disposition n'est envoyée au processus principal pendant le geste. | Épreuves visibles **79–94 ms** après le début du geste, 2 volets sur 2. Temps du fil principal **190,2 → 116,1 ms** (−39 %), script **50,8 → 15,6 ms** (−69 %), mises en page **56 → 39** pour un geste de 1,6 s. Captures : `captures/lot3-glissement-avant.png` (fond vide), `captures/lot3-glissement-apres.png`. |
| Flous opaques | `backdrop-filter` retiré des cartes posées sur le papier opaque — `.home-card`, `.home-pins`, `.pin-card`, `.mini-tile`, `.tab-row[data-active]` — et gardé sur le chrome et les surfaces qui flottent au-dessus d'une page (rail, en-têtes de volet, tiroirs, menus, barre d'état, champ de recherche de l'accueil). | Nœuds floutés à l'accueil : **9 → 4**. Remettre le flou par CSS ne change l'image que de **13/255 au maximum** sur les cartes (moyenne 0,07/255, animations figées), 4/255 sur `.mini-tile`, 2–3/255 sur `.home-pins` et l'onglet actif : le flou ne montrait rien, il payait une couche de composition par carte. Captures : `captures/lot3-accueil.png`. |

### Ce que la mesure a appris

- **Le coût du survol venait de l'héritage, pas des transitions.** Écrire `--aurora-x` sur `.start`
  invalidait le style de tous les descendants ; déplacer ces deux variables sur `.home-aurora` a
  suffi à retirer les deux tiers du recalcul. Le regroupement par image et la transition coupée
  font le reste.
- **Une capture de volet coûte ~35 ms pour deux pages**, à condition de les demander en parallèle :
  en séquence, l'épreuve arrivait après la fin d'un glissement court. La capture doit précéder le
  retrait des vues — une vue cachée n'a plus de trame à rendre. D'où l'ordre : capture, puis
  retrait, avec un garde-fou de 120 ms ; si la capture arrive plus tard, elle remplace le fond de
  veille sans retarder le geste.
- **Le diff de pixels est la seule preuve honnête pour un flou.** Couper `backdrop-filter` puis
  comparer les images, animations figées, donne 13/255 au pire : invisible à l'œil, là où le simple
  comptage des couches ne disait rien du rendu (13 au premier rendu de l'audit initial, 9 sur le
  profil de ce lot).

### Limites

- Les épreuves sont **figées** : le contenu ne se réajuste pas à la nouvelle largeur pendant le
  geste (c'est le prix de garder le pointeur dans la coque). Les images sont rognées, pas déformées.
- `.pin-card` et `.mini-tile` n'ont pas pu être mesurés isolément faute d'épingles sur l'accueil du
  profil de test pour la première ; `.mini-tile` l'a été (4/255), `.pin-card` reste déduit de son
  conteneur `.home-pins` (2/255).
- `.brief-item` et la barre d'état gardent leur flou : posés sur une feuille ou au-dessus d'une
  page, leur fond n'est pas opaque.
- Le glissement reste mesuré par des événements CDP : le comportement du pointeur au-dessus d'une
  vue native (et donc la raison d'être des épreuves) est déduit de la documentation Electron et de
  l'observation du geste, pas d'un pilotage souris système.

**Fichiers.** `components/StartPage.tsx`, `components/Workspace.tsx`, `styles.css`,
`main/browser.ts`, `preload/index.ts`, `shared/api.ts`, `shared/types.ts`.
Vérifications : `npm run typecheck` (code 0), `npm test` (38 fichiers, 390 tests), `npm run build`
(code 0), puis les mesures ci-dessus dans l'app réelle.

## Suivi — lot 4 livré le 1er novembre 2026

Troisième volet : une seule échelle de mouvement, et des sorties qui se voient. Même méthode —
app réelle, profil isolé, fenêtre 1380 × 880, échantillonnage **par image** dans la page
(`requestAnimationFrame`) pour dater les fondus à la trame près, plus `Performance.getMetrics`
autour de six cycles ouverture/fermeture.

### L'échelle

| Avant | Après |
| --- | --- |
| 24 durées distinctes entre 80 et 540 ms dans les déclarations `transition`/`animation`, dont cinq (140, 150, 160, 170, 180) que l'œil ne sépare pas. | **5 pas** : 120 ms (appui), 160 ms (survol, bascule), 220 ms (feuille, sortie), 320 ms (grande surface), 480 ms (accueil). |
| 6 `cubic-bezier` écrits à la main, dont `--ease-spring` jamais utilisé, plus `ease`, `ease-in-out`, `linear` en clair (264 `ease` nus). | **5 courbes nommées** : `--ease-out`, `--ease-in`, `--ease-standard` (la courbe `ease`, identique au pixel), `--ease-in-out`, `--ease-spring`, et `--ease-linear` pour les boucles. Aucune courbe brute ne reste. |

Chaque valeur a rejoint le pas le plus proche : l'écart maximal est de **30 ms** (140 → 160,
180 → 160, 260/270 → 220, 500/540 → 480). Les seules durées brutes restantes sont les boucles
d'ambiance (rotation, aurore, dragon, braise : ≥ 700 ms) et les `0,01 ms` de
`prefers-reduced-motion`, qui ne sont pas du mouvement d'interface.

### Les sorties

| Surface | Avant | Après |
| --- | --- | --- |
| Panneau (Réglages, brief, palette, espace…) | Disparaissait **dans l'image qui suivait Échap** : feuille présente à 192 ms, absente à 210 ms, opacité du fond jamais sous 1,00. | Le fond s'efface pendant **220 ms** : 1,00 (209 ms) → 0,99 → 0,96 → 0,86 → 0,72 → 0,55 → 0,36 → 0,14 → 0,02 → 0,00 (443 ms), **aucune image sans feuille** au milieu (`sheetGaps: []`). La feuille se repose de 4 px et rétrécit de 1 %. |
| Tiroir de notes, panneau Agent | Retiré du DOM d'un coup. | Fondu + glissement de 18 px vers le bord en **220 ms** (1,00 → 0,00 sur 16 images). |
| Toast | Disparaissait à pleine opacité (1,00 à 56 ms, absent à l'image suivante). | S'efface en **160 ms** (0,40 → 0,25 → 0,10 → 0,00), retiré de la liste 180 ms après la demande. Il garde sa ligne pendant ce temps : la pile ne saute pas. |

Coût : six cycles ouverture/fermeture passent de **931 → 948 ms** de temps principal (+1,8 %,
soit ~3 ms par fondu), 26 → 30 mises en page, 583 → 588 recalculs de style. Rien ne change dans
la fluidité du reste de l'interface.

### Ce que la mesure a appris

- **Un effet ordinaire ne suffit pas pour une sortie.** Première version : l'état « en train de
  sortir » était posé dans `useEffect`, donc après la peinture. Résultat mesuré — la feuille
  existait à 192 ms, **disparaissait à 210 ms**, puis réapparaissait à 229 ms pour s'effacer :
  exactement le clignotement qu'on voulait supprimer. `useLayoutEffect` règle le problème, l'état
  est ajusté avant que l'image soit peinte.
- **Une mise à jour d'état pendant le rendu est perdue ici.** Poser `closing` depuis le corps du
  composant marchait en apparence, mais le panneau différé (`lazy`) suspend au premier rendu et
  React jette les mises à jour de cet essai : `held` restait faux, et la surface disparaissait
  quand même. La mesure l'a montré (élément détaché à l'image suivante, jamais d'attribut
  `data-closing`), la lecture seule ne l'aurait pas fait.
- **La relève doit être immédiate, la fermeture animée.** `exit={!overlay}` : quand un autre
  panneau prend la place (réglages → espace), l'ancien se démonte sans fondu — sinon son fond
  sombre s'effacerait par-dessus le panneau qui arrive. Notes et agent suivent la même règle
  l'un envers l'autre.
- **Un toast illisible ne pouvait pas « s'effacer » joliment.** En mesurant la sortie, le toast
  s'est révélé invisible dans **les deux thèmes** : `color: var(--paper)` posé pour un fond
  `--ink`, mais le fond avait été repassé au verre (`--glass-strong`) plus bas dans la feuille —
  mesuré `rgb(250,248,245)` sur `rgba(255,253,250,0.9)` en clair, `rgb(21,21,24)` sur
  `rgba(24,24,29,0.92)` en sombre. Corrigé en `var(--ink)`, lisible dans les deux.

### Limites

- Mesures prises sur macOS arm64, fenêtre 1380 × 880, animations non ralenties. Le coût des fondus
  n'a pas été mesuré sous charge (build de production, page lourde ouverte).
- La preuve visuelle d'un fondu de 220 ms ne tient pas dans une capture CDP (l'encodage arrive
  après la fin) : les images `lot4-panneau-sortie.png` et `lot4-notes-sortie.png` sont **figées à
  110 ms** avec l'API Web Animations, démontage retenu le temps de la photo. Les pixels sont ceux
  de l'animation réelle à cet instant, pas une pose composée.
- `prefers-reduced-motion` vérifié : 0 animation à l'ouverture des réglages, sortie en 0,01 ms,
  surface démontée à +380 ms, accueil cliquable dès la fermeture (la palette s'ouvre).
- La palette ⌘K et l'agent ancré ont été revérifiés après l'ajout du conteneur de présence
  (largeur 680 px centrée, agent 419 px, page 616 px) : `display: contents` ne change pas la mise
  en page.

**Fichiers.** `styles.css`, `App.tsx`, `components/Presence.tsx`, `components/Toasts.tsx`,
`store/browser.ts`.
Vérifications : `npm run typecheck` (code 0), `npm test` (38 fichiers, 390 tests), `npm run build`
(code 0), puis les mesures et captures ci-dessus dans l'app réelle
(`captures/lot4-panneau-ouvert.png`, `lot4-panneau-sortie.png`, `lot4-notes-ouvert.png`,
`lot4-notes-sortie.png`, `lot4-palette.png`, `lot4-agent-ouvert.png`, `lot4-toast.png`).

### Vocabulaire et doublons (fin du lot 4)

Un nom par objet, et une seule porte par action.

| Objet | Avant | Après |
| --- | --- | --- |
| Reprise du jour | « Brief du jour » (palette, menu, réglages, onboarding, `aria-label`), « Reprendre le fil » (carte de la sidebar, titre du panneau), « Reprendre » (puce d'accueil) | **Brief** partout : carte de la sidebar, titre et `aria-label` du panneau, palette, menu (`⌘⇧B`), liste des raccourcis, onboarding, textes d'aide. |
| Mode de recherche | « Travail » (rail, menu, palette, réglages, texte de confidentialité) et « Atelier » (agent embarqué) | **Atelier** : titre et libellé du rail, menu, palette (« Passer en Atelier »), raccourcis, `aria-label` du groupe de modes, texte de confidentialité. |
| Productions de l'agent | « Travaux » (onglet de l'agent, en-tête de liste, filtres, état vide) | **Rapports** : bouton, titre, `aria-label`, filtres, états vides (« Aucun rapport pour l'instant. »). |

Doublons de l'accueil :

- **« Personnaliser » deux fois** (bouton d'en-tête à côté de la date, lien de pied de page) pour la même action : le lien de pied de page est retiré, le bouton d'en-tête reste. Sa règle CSS (`.home-customize-foot`) part avec lui, y compris dans la liste `prefers-reduced-motion`.
- **Brief accessible trois fois** (carte de la sidebar, puce « Reprendre » de l'accueil, palette) en plus du menu : la puce est retirée. Il reste la carte de la sidebar, la palette et le menu — les deux surfaces que l'audit jugeait utiles.

Vérifié à l'exécution, fenêtre 1380 × 880, profil neuf : pastilles d'accueil **`["Palette", "Agent"]`** (3 → 2), pied de page sans « Personnaliser », **un seul** bouton « Personnaliser » dans l'accueil, carte de la sidebar « BRIEF · dimanche 1 novembre », panneau `h1` et `aria-label` = « Brief », rail **`["Navigation (⌘⇧A)", "Atelier (⌘⇧A)"]`**, palette **`["Brief ⌘⇧B", "Passer en Atelier ⌘⇧A"]`**, liste de l'agent **« Rapports »**, `aria-label` « Rapports de l'atelier », filtre « Filtrer les rapports », état vide « Aucun rapport pour l'instant. ». Captures : `captures/lot4-accueil-vocabulaire.png`, `lot4-brief.png`, `lot4-palette-vocabulaire.png`, `lot4-atelier-rapports.png`.

**Ce qui garde le mot « travail », volontairement** : le nom de l'espace par défaut et les préréglages d'espaces (`shared/space.ts`) — c'est une donnée à l'utilisateur, pas le mode ; la catégorie arXiv « Travaux » et la phrase « Travaux de recherche » (source documentaire, pas production de l'agent) ; les verbes et expressions (« l'IA travaille », « Espace de travail »). Les libellés du menu natif ont été alignés par lecture : ils ne sont pas observables par CDP.

**Fichiers.** `components/StartPage.tsx`, `components/Sidebar.tsx`, `components/BriefPanel.tsx`, `components/CommandBar.tsx`, `components/SpaceRail.tsx`, `components/SettingsPanel.tsx`, `components/WorkList.tsx`, `components/AgentCanvas.tsx`, `components/Onboarding.tsx`, `components/Workspace.tsx`, `components/TunnelSidebar.tsx`, `shared/network.ts`, `main/menu.ts`, `styles.css`.
Vérifications : `npm run typecheck` (code 0), `npm test` (38 fichiers, 390 tests), `npm run build` (code 0), puis les contrôles ci-dessus dans l'app réelle.

## Lot 5 — découpage, sans changer un pixel

`styles.css` était une feuille unique de **16 461 lignes** ; le panneau des réglages, un fichier de
**1 471 lignes** qui portait ses sept pages.

### Ce qui a été découpé

La feuille est une **pile de couches** : plusieurs passes ont réécrit les mêmes écrans, et c'est la
dernière règle rencontrée qui gagne. Un découpage par domaine aurait déplacé des règles d'une couche
à l'autre et changé la cascade. La découpe suit donc **l'ordre du fichier**, en tranches contiguës :

| Feuille | Lignes |
| --- | --- |
| `01-socle-jetons.css` | 175 |
| `02-lancement-rail-barre-laterale.css` | 722 |
| `03-espace-de-travail.css` | 361 |
| `04-accueil-hero.css` | 592 |
| `05-palette-surcouches.css` | 372 |
| `06-feuilles-agent-markdown.css` | 846 |
| `07-notes-reglages-dialogue.css` | 864 |
| `08-mouvement.css` | 237 |
| `09-verre-chrome.css` | 2 866 |
| `10-revue-interface.css` | 678 |
| `11-tunnel-themes.css` | 2 324 |
| `12-notes-accueil-widgets.css` | 1 899 |
| `13-espaces.css` | 1 079 |
| `14-epingles-rail-mini.css` | 1 143 |
| `15-fenetre-etroite.css` | 455 |
| `16-finitions-carte-a-voir.css` | 423 |
| `17-accueil-0313.css` | 342 |
| `18-ambiance-braise.css` | 346 |
| `19-bento-notes-rapides.css` | 313 |
| `20-onglet-audio.css` | 216 |
| `21-favoris-liste.css` | 208 |

[styles.css](../src/renderer/src/styles.css) ne garde que les vingt et un `@import`, dans l'ordre
d'origine, avec la consigne de ne pas les réordonner. Deux feuilles restent grosses
(`09-verre-chrome`, `11-tunnel-themes`) : chacune porte une passe entière sur plusieurs écrans, la
couper aurait demandé de réécrire des sélecteurs.

Côté composants, deux pages quittent [SettingsPanel.tsx](../src/renderer/src/components/SettingsPanel.tsx)
(1 471 → **1 081 lignes**) :

- [AppearancePage.tsx](../src/renderer/src/components/AppearancePage.tsx) (345 lignes) — mode, thème de
  couleur, ciel, transparence, fond, avec ses quatre tables d'options ;
- [AboutPage.tsx](../src/renderer/src/components/AboutPage.tsx) (98 lignes) — identité, version, mise à
  jour ; elle lit `update` dans le store comme le reste du panneau.

Les deux extractions déplacent du balisage **sans le réécrire** : seule l'indentation change, les
listes d'options suivent leur page, et les imports devenus inutiles sont retirés.

### La preuve

Le harnais `.audit-lot5/` photographie **14 écrans** (accueil clair, sombre, fenêtre 1000 × 760,
palette avec requête fixe, brief, notes, atelier et rapports, les sept pages des réglages), fenêtre
1380 × 880, dans un profil neuf, réseau coupé.

Pour que deux lancements donnent les mêmes pixels :

- horloge figée **avant le premier script de la page** (la carte météo lit `new Date()` au montage :
  deux lancements à une minute d'écart affichaient deux heures différentes) ;
- `prefers-reduced-motion` émulé : le ciel se fige, et les braises — tirées au hasard — ne sont plus
  dessinées ;
- durées de transition et d'animation ramenées à zéro : aucun fondu n'est photographié à mi-course ;
- pointeur sorti de la fenêtre : la fenêtre peut s'ouvrir sous le curseur de la machine, et une
  exécution capturait alors un état de survol ;
- conteneurs de défilement remis à zéro avant chaque image ;
- rendu logiciel, anticrénelage en niveaux de gris, favicons bloqués.

Bruit du harnais mesuré sur deux séries du **même** build : **1 pixel** à 1/255 sur 14 écrans.

Comparaison « avant » (feuille unique, pages en ligne) contre « après » (21 feuilles, 2 pages
extraites), chaque état construit puis photographié :

```
accueil-clair.png — 0 px différents
accueil-etroit.png — 0 px différents
accueil-sombre.png — 0 px différents
atelier-rapports.png — 0 px différents
brief.png — 0 px différents
notes.png — 0 px différents
palette.png — 0 px différents
reglages-apparence.png — 0 px différents
reglages-apropos.png — 0 px différents
reglages-confidentialite.png — 0 px différents
reglages-modeles.png — 0 px différents
reglages-navigation.png — 0 px différents
reglages-notes.png — 0 px différents
reglages-raccourcis.png — 0 px différents

IDENTIQUES : 14 écrans, 0 pixel différent.
```

L'empreinte de géométrie (chaque boîte de l'arbre : position, taille, opacité, couleur, fond) est
**identique sur les 14 écrans**. Une troisième série, prise après durcissement du harnais, redonne
exactement le même zéro.

Au niveau du bundle, la feuille construite est **identique au caractère près**, à cinq lignes vides
près : l'assembleur de Vite retire la ligne vide qui ouvre un fichier importé, cinq fois. Une ligne
vide entre deux règles ne peut rien changer — et les captures le confirment.

**Fichiers.** `src/renderer/src/styles/*.css` (21 feuilles), `styles.css`, `components/SettingsPanel.tsx`,
`components/AppearancePage.tsx`, `components/AboutPage.tsx`.
Vérifications : `npm run typecheck` (code 0), `npm test` (38 fichiers, 390 tests), `npm run build`
(code 0), puis les séries de captures ci-dessus.

**Limites.**

- Le diff ne couvre que les 14 écrans photographiés. Le tunnel de l'atelier (vue de recherche), le
  glissement de la vue scindée, la fenêtre de dialogue d'espace, l'onboarding et la fenêtre mini ne
  sont pas dans la série : ces zones sont couvertes par la lecture seule du diff de feuilles, pas par
  une image.
- La preuve porte sur un thème à la fois pour l'accueil (clair et sombre), et sur le seul thème clair
  pour les réglages.
- Les noms des feuilles décrivent leur contenu, pas un découpage par domaine : deux passes entières
  restent dans une même feuille, comme expliqué plus haut.

## Raccourcis du menu : Windows et Linux

Le menu natif était écrit pour macOS, et l'interface avec lui. Quatre défauts, tous visibles
seulement sur un PC :

1. `item()` ne posait l'accélérateur que si `isMac` : sous Windows et Linux, **aucun raccourci ne
   s'affichait** à côté des entrées, alors que la frappe fonctionnait déjà.
2. Les chaînes étaient en `Cmd+T`, `Cmd+Shift+N`… Or `Cmd` n'existe pas hors macOS : il faut
   `CmdOrCtrl`, que Chromium traduit en ⌘ sur macOS et en Ctrl ailleurs.
3. Hors macOS, le menu n'offrait **aucune entrée « Réglages… »** (elle vivait dans le menu
   d'application, réservé à macOS) alors que ⌘, / Ctrl+, est intercepté partout.
4. Côté interface, `shortcut()` ne traduisait que ⌘ : la page Raccourcis affichait « Ctrl+⇧T » sous
   Windows, et une dizaine d'infobulles, titres et exemples écrivaient ⌘ en dur (rail, agent, notes
   rapides, mini-fenêtre, onboarding, marque-pages, vignette de note).

### Ce qui change

| Endroit | Avant | Après |
| --- | --- | --- |
| Accélérateur du menu | `Cmd+T`, posé sur macOS seulement | `CmdOrCtrl+T`, posé sur les trois plateformes, jamais enregistré |
| `item()` | `...(accelerator && isMac ? …)` | `{ accelerator, registerAccelerator: false }` |
| Réglages | menu d'application macOS uniquement | « Réglages… » aussi dans **Fichier** sous Windows et Linux |
| Menu | `installMenu()` construisait le gabarit en ligne | `buildMenuTemplate(platform, send)` pur, `installMenu()` ne fait que l'installer |
| `shortcut()` | `⌘` ou `Ctrl+`, `⇧` laissé tel quel | macOS : `⌘⇧T` ; ailleurs : `Ctrl+Shift+T` |
| Lecteur d'écran | `keys.replace('⌘', …)` | `spokenShortcut()` : « Commande Maj T » / « Contrôle Maj T » |
| Infobulles et exemples | `⌘J`, `⌘E`, `⌘D`, `⌘R`, `⌘[`, `⌘↵` en dur | `shortcut('J')`, `shortcut('E')`, … |

L'accélérateur reste **déclaré mais non enregistré** : la frappe est interceptée dans
`TabManager.handleInput`, qui la fait passer dans les pages comme dans la coque. L'enregistrer
exécuterait chaque action deux fois.

### Vérifié

- [menu.test.ts](../src/main/menu.test.ts), 7 tests sur les trois plateformes : **25 accélérateurs**,
  tous en `CmdOrCtrl+`, tous avec `registerAccelerator: false`, **jeu identique** macOS / Windows /
  Linux, menu d'application réservé à macOS, et chaque clic envoie bien son action.
- [format.test.ts](../src/renderer/src/lib/format.test.ts), 2 tests de plus : `⌘K` et `⌘⇧T` sur
  macOS, `Ctrl+K` et `Ctrl+Shift+T` sous Windows et Linux, et **aucun glyphe Apple** dans les
  dix-sept clés utilisées par la page Raccourcis.
- Interception déjà neutre : `mod = platform === 'darwin' ? input.meta : input.control`
  ([tabs.ts:1044](../src/main/tabs.ts#L1044)), et la table couvre les 25 actions du menu — plus
  ⌃Tab / ⌃Page↑↓ et le zoom `+` `-` `0`, traités à part.
- À l'exécution sur macOS, build courant (sonde CDP) : rail **« Notes (⌘E) », « Agent (⌘J) »,
  « Replier la barre latérale (⌘S) », « Réglages (⌘,) »** ; page Raccourcis **26 lignes**, `⌘K`…`⌘⇧H`,
  `aria-label` « Commande K ». Rien n'a bougé sur macOS.

**Limites.** Aucune machine Windows ni Linux n'est disponible ici : la preuve d'affichage est le
**gabarit de menu** — exactement ce qu'Electron rend — plus les tests de chaînes, pas une capture de
la barre de menus système. Sous Windows et Linux la barre reste masquée par défaut
(`autoHideMenuBar`) et s'ouvre avec Alt : c'est le comportement attendu de la plateforme, pas une
régression.

## Règles sans producteur

Un scanner a comparé chaque sélecteur des vingt et une feuilles au code réel. Trois passes successives
ont été nécessaires : la première se contentait de chercher la chaîne (`eyebrow` « vivant » parce que
`home-eyebrow` existe), la deuxième comparait aux frontières de nom, la troisième lit chaque composé
d'un sélecteur (`.brief-item[data-kind] .brief-label` exige d'abord que `.brief-item` existe).

### Ce qui a été trouvé

**123 règles** dont aucun élément ne peut porter le sélecteur, en trois familles :

| Famille | Sélecteurs retirés | Ce qu'ils stylaient |
| --- | --- | --- |
| Ancien accueil | `.start-hero`, `.hero-field`, `.hero-dot`, `.stat-strip`, `.stat-chip`, `.brief-cards`, `.brief-item`, `.brief-title`, `.brief-detail`, `.brief-go`, `.brief-number`, `.recent-list`, `.recent-row`, `.recent-icon`, `.recent-copy`, `.recent-host`, `.recent-time`, `.starter-grid`, `.starter-link`, `.starter-label`, `.starter-detail`, `.starters-lede`, `.start-tasks`, `.tasks-toggle`, `.shortcut-list`, `.shortcut-row`, `.privacy-strip`, `.start-foot`, `.section-head`, `.section-count`, `.start-section`, `.start-body` | la page d'accueil d'avant la refonte « home » (héro, colonne de brief, liste des récents, grille de démarrage, raccourcis, bandeau de confidentialité, pied) |
| Ancienne barre latérale | `.sidebar-foot`, `.foot-btn`, `.command-trigger` | le pied de la barre qui portait « déplacer / fermer », et son bouton de commande |
| Ancien statut et agent | `.status-mode`, `.status-kbd`, `.agent-active`, `.agent-overlay`, `.key-row`, `.settings-body`, `.accent-swatch`, `.accent-dot`, `.work-panel`, `.pins-wrap`, `.preview-host`, `.no-drag` | la pastille de mode de la barre d'état, les rangées de clé des modèles, les pastilles d'accent, les épingles de l'accueil |

### Les chiffres

| Mesure | Avant | Après |
| --- | --- | --- |
| Règles CSS | 2 244 | **2 121** (−123) |
| Octets des feuilles | 322 377 | **307 205** (−15 172, −4,7 %) |
| gzip des feuilles | 54 931 | **52 694** (−2 237, −4,1 %) |
| Feuille construite | 322,88 kB | **307,71 kB** |

Après retrait, le scanner ne trouve plus **aucune** règle sans producteur et **aucune** liste mixte
(une partie morte, une partie vivante).

### La preuve

Série « avant » prise sur le build exact d'avant le nettoyage, série « après » sur le build nettoyé,
même harnais que le lot 5 (horloge figée, mouvement réduit, pointeur sorti, défilement remis à zéro,
rendu logiciel) :

```
IDENTIQUES : 14 écrans, 0 pixel différent.
```

L'empreinte de géométrie (position, taille, opacité, couleur et fond de chaque boîte) est identique
sur les 14 écrans. C'est ce qu'on attend d'un retrait de règles mortes : si un sélecteur avait encore
servi, l'écran concerné aurait bougé.

Deux garde-fous en plus des images :

- **frontière de nom** : un jeton n'est déclaré vivant que s'il apparaît comme nom complet (`eyebrow`
  n'est pas `home-eyebrow`), avec repli sur les 39 préfixes de classes construites par gabarit
  (`tab-${…}`) ;
- **contrôle par le bundle** : aucune des **50 classes** retirées n'apparaît comme nom complet dans
  les 1,3 Mo de JavaScript construit, tous les morceaux chargés à la demande compris. Deux
  sous-chaînes subsistent — `recent-row`, `recent-title` — mais elles viennent de `agent-recent-row`
  et `agent-recent-title`, des noms différents qui ont leurs propres règles.

**Fichiers.** Les vingt et une feuilles de `src/renderer/src/styles/`.
Vérifications : `npm run typecheck` (code 0), `npm test` (39 fichiers, 399 tests), `npm run build`
(code 0), accolades équilibrées dans les 21 feuilles, puis la série de captures ci-dessus.

**Limites.** Le diff d'images porte sur les 14 écrans du harnais ; le tunnel de l'atelier, le
dialogue d'espace, l'onboarding et la fenêtre mini n'y sont pas. Pour eux, la preuve est statique :
le sélecteur n'a aucun producteur dans le bundle, donc aucun élément ne peut le recevoir. Le scanner
reste une heuristique sur les classes fabriquées par concaténation : les 39 préfixes repérés couvrent
les gabarits actuels, mais un nom construit par assemblage de tableaux échapperait aux deux contrôles.
