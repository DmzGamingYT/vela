# Vela 0.3.19 — notes de version

Publiée par le workflow `release.yml` au moment du push : la 0.3.18 existe déjà,
donc cette version déclenche un build et une release neuve.

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

## Après publication

Reporter les empreintes SHA-256 de la release dans `site/public/index.html` et
`site/public/site.js`, passer le site en 0.3.19, puis commit.
