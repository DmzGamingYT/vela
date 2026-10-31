# Documentation Vela

Ce dossier rassemble les documents de travail du dépôt : l'audit et ses preuves
visuelles, les notes de version. Le [README principal](../README.md) décrit
l'application elle-même ; les pages publiées vivent dans `site/`.

| Document | Contenu |
|---|---|
| [AUDIT.md](AUDIT.md) | Audit des phases 0 et 1 : inventaire, score de risque, constats numérotés (A à F) et suivi des correctifs des lots 1 à 3. Chaque constat renvoie à sa capture ou à son fichier. |
| [RELEASE-0.3.16.md](RELEASE-0.3.16.md) | Notes de version proposées pour 0.3.16 et checklist de publication par plateforme. Rien n'est publié tant que la version n'est pas poussée sur `main`. |
| [captures/](captures/) | Preuves visuelles citées par l'audit : paires avant/après des lots, état de l'accueil et des réglages en phase 1, aperçus du Bento Grid. |

## Captures

Les images suivent le nom du constat qu'elles prouvent :

- `lot{1,2,3}-{avant,apres}-{sujet}-{clair,sombre}.png` — une correction, avant et après ;
- `audit-phase1-{écran}.png` — l'état relevé pendant la phase 1 ;
- `bento-{écran}-preview.png` — les aperçus de la refonte de l'accueil.

Seules les captures **citées par un document de ce dossier** sont versionnées :
les règles du `.gitignore` n'autorisent que ces trois familles, tout le reste
(captures de travail, essais d'ambiance, états intermédiaires) reste sur la
machine qui les a prises. Pour ajouter une preuve, la citer depuis
[AUDIT.md](AUDIT.md) puis ouvrir le motif correspondant dans le `.gitignore` si
elle n'entre dans aucune des trois familles.
