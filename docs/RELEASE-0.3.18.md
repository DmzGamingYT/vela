# Vela 0.3.18 — notes de version

Version **préparée**, non publiée. La 0.3.17 reste la version téléchargeable.

## Ce qui change

- **Accueil.** Le champ ne porte plus qu'un bouton, l'envoi ; `Palette` et `Agent`
  rejoignent la ligne du moteur sous le champ, qui prend la largeur des cartes.
  « Personnaliser » descend dans le pied de page, à la place d'un rappel `⌘K`
  devenu redondant.
- **Tuiles Récemment.** Un clic ouvre dans l'onglet, ⌘-clic et clic-milieu dans un
  onglet neuf, ⌥-clic en vue scindée ; le menu contextuel (`⇧F10`) propose les
  mêmes actions et la copie de l'adresse. Deux tuiles par domaine au plus, et un
  libellé lisible quand l'historique n'a pas de titre.
- **Cartes vides.** Les tâches et les notes n'affichent plus de jauge à 0 % ni de
  texte « rien pour l'instant » : titre et champ suffisent.
- **Rail.** « Atelier » quitte les étincelles (réservées à l'agent), le repli de
  la barre latérale remonte en haut du rail avec son état exposé, et un filet
  sépare les outils des réglages.
- **Lectures bornées.** Le tunnel lit les pages par flux et s'arrête à 400 000
  octets au lieu de charger la réponse entière.
- **Lisibilité.** Plancher de 11 px pour le texte porteur d'information de
  l'accueil, cibles interactives à 28 px.
- **Production.** Le journal de la barre de menus ne s'écrit plus hors mode dev.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 39 fichiers, 399 tests |
| `npm run build` | 0 |

## À faire à la publication

1. Construire les installateurs (`npm run dist:mac`, `dist:win`, `dist:linux`).
2. Créer la release `v0.3.18` et y déposer les neuf fichiers.
3. Relever les empreintes SHA-256 des installateurs et les reporter dans
   `site/public/index.html` (tableau de téléchargement) et `site/public/site.js`.
4. Passer le site en 0.3.18 seulement après l'étape 3 : les tests de parité
   refusent une version en avance sur l'application.
