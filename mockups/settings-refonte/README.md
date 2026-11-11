# Réglages Vela — proposition de refonte

Maquette statique, sans modification de l’application. Elle sert à valider l’architecture et le langage visuel avant de coder.

## L’idée

Les réglages passent d’un annuaire de dix pages à un **atelier en trois colonnes** :

1. **Sommaire** — six destinations, quatre familles, une recherche globale.
2. **Contenu** — une section à la fois, avec des sous-sections en onglets.
3. **Rail de contexte** — un aperçu ou un bilan utile, sans quitter la page.

La nouvelle entrée **Vue d’ensemble** répond à la question « où suis-je, et qu’est-ce qui est déjà réglé ? » avant de faire choisir parmi des dizaines de lignes.

## Nouvelle architecture

| Section | Sous-sections | Ce qui change |
| --- | --- | --- |
| Vue d’ensemble | 4 états, 3 raccourcis | Nouvelle page d’entrée |
| Apparence | Mode & couleur, Accueil, Interface, Accessibilité | Fusionne Apparence + Tweaks + Thèmes |
| Navigation | Recherche, Démarrage, Bibliothèque, Téléchargements, Pages web | Découpe la page de 850 lignes |
| Confidentialité | Protection, Données locales, Permissions, Flux réseau | Conserve les quatre audits, avec un bilan visible |
| Agent | Modèle actif, Fournisseurs, Notes | Fusionne Modèles + Notes |
| Système | Raccourcis, Mises à jour, À propos | Fusionne les trois pages de fin |

## Le motif de section

- Un **en-tête éditorial** : numéro, titre serif, phrase d’intention, état facultatif.
- Des **panneaux plats** avec un seul niveau de bordure.
- Des **lignes de réglage** régulières : libellé, aide courte, contrôle à droite.
- Une zone **Avancé** repliable pour ce qui n’a pas besoin d’être visible au quotidien.
- Une **recherche globale** qui retrouve le réglage et ouvre directement la bonne sous-section.
- Un **rail de droite** qui montre un aperçu en direct (Apparence), un bilan (Confidentialité), un état (Agent) ou une synthèse (Navigation, Système).

## Ce que la maquette démontre

- Navigation entre les six sections.
- Sous-onglets fonctionnels dans chaque section.
- Thème clair/sombre et cartes de mode.
- Recherche globale avec suggestions et résultats.
- Switches, choix segmentés et sélecteurs d’état.
- Mise en page responsive : le rail disparaît d’abord, puis le sommaire.

## À valider avant le code

1. Le nombre de sections (six) et la fusion d’Apparence/Tweaks/Thèmes.
2. La présence d’une **Vue d’ensemble** comme page d’accueil des réglages.
3. Le rail de contexte à droite, ou une version à deux colonnes.
4. Le niveau de densité des lignes et la place de la recherche globale.
