# Vela — site vitrine

Site public de Vela, en HTML, CSS et JavaScript statiques. Il reprend la palette et le verre
liquide de Zephium : nuit `#09090b`, texte `#f4f4f6`, halos bleu `#62c8ff`, indigo `#5b7dff`
et violet `#a88cff`.

Le thème clair suit le système par défaut ; le bouton soleil/lune de la barre de navigation force
un thème et le retient dans `localStorage` (`vela-theme`). Les maquettes de l’application suivent elles aussi le thème choisi, pour rester lisibles en mode clair.

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
│   ├── index.html     page unique (héros, démo, agent, confidentialité, modèles, version)
│   ├── styles.css     thème, verre, maquettes d’interface
│   ├── script.js      thème, menu, onglets de démo, note de version, révélations
│   ├── favicon.svg
│   └── robots.txt
├── worker.js          sert les assets via env.ASSETS
└── deploy.json        manifeste Sites (assetsDirectory: ./public)
```

Aucune dépendance, aucun appel réseau, aucune police distante : la page fonctionne hors ligne.

## Déploiement

Le manifeste est prévu pour Freebuff Sites. Le Worker ne fait que servir `env.ASSETS`.
Déployer d’abord en preview, vérifier, puis publier en production.

Le canonical et `og:url` pointent vers le domaine de production ; si le domaine change, mettre à jour
les deux balises dans `public/index.html`.

## Vérifié

Page et assets en 200 avec les bons types, aucun appel réseau externe, aucun débordement horizontal
de 1440 px à 390 px, menu mobile et Échap, onglets de démo au clavier, note de version (`<dialog>`) et
révélations au défilement (les éléments déjà dans le viewport sont révélés dès le chargement).

Thème clair vérifié par calcul de contraste (AA sur les textes ≥ 11 px), bascule sans rechargement,
choix persistant et priorité au système en l’absence de choix. La navigation tient à 320 px avec le
bouton de thème et le menu.
