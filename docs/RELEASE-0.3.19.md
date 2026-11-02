# Vela 0.3.19 — notes de version

**Publiée le 2 novembre 2026** : le workflow `release.yml` a construit les trois plateformes
après le push, et la release `v0.3.19` est en ligne.

## Ce qui change

- **Icône.** « Voile au soleil » remplace le voilier en verre : soleil plus petit
  et plus haut, voile détachée de l'horizon, mer affinée, reflet de verre en tête
  de tuile. Le gabarit de barre de menus est redessiné plein, lisible à 16 pt.
  Les trois pistes écartées restent dans `build/icon-proposals/`.
- **Sites épinglés.** La rangée adopte les vignettes de Dia : cases carrées de
  96 px, favicon centré, tuile « + » en pointillés qui ferme la rangée, et
  chevron dans l'en-tête pour replier la barre — choix retenu par espace. Le nom
  reste dans l'infobulle, le glisser, les flèches et le menu contextuel sont
  conservés.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | 0 |
| `npm run build` | 0 |
| Captures | accueil recapturé, rangée vide = une seule tuile pointillée |

## Après publication (fait)

Le site est passé en 0.3.19 avec les empreintes SHA-256 lues sur la release, et la
page Nouveautés reçoit son entrée.
