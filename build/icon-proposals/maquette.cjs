/* Vela — planche de six directions d'icône, dessinées de zéro.
   Même palette que le site : encre #0F1311, vert #1A7A5E, papier #F7F6F2,
   corail #E8805A. Un aplat par forme, aucun dégradé.
   Rendu : scripts/shot.cjs sur maquette.html. */
const fs = require('node:fs')
const path = require('node:path')

const ENCRE = '#0F1311'
const VERT = '#1A7A5E'
const PAPIER = '#F7F6F2'
const CORAIL = '#E8805A'

const svg = (fond, formes) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect x="96" y="96" width="832" height="832" rx="186" fill="${fond}"/>
  ${formes}
</svg>`

const concepts = [
  {
    id: '1-voile',
    nom: 'La voile',
    note: 'Un seul aplat, la toile au vent. Rien d’autre.',
    svg: svg(VERT, `<path d="M372 236 C 500 330 610 500 664 672 H372 Z" fill="${PAPIER}"/>`)
  },
  {
    id: '2-barque',
    nom: 'La barque',
    note: 'Voile et coque réunies : la silhouette d’un bateau.',
    svg: svg(
      VERT,
      `<path d="M356 208 C 462 340 556 520 604 660 H356 Z" fill="${PAPIER}"/>
       <path d="M296 680 H716 L660 782 C 610 800 410 800 360 782 Z" fill="${PAPIER}"/>`
    )
  },
  {
    id: '3-sillage',
    nom: 'Le sillage',
    note: 'La barque et ses deux rides : le mouvement, sans couleur en plus.',
    svg: svg(
      VERT,
      `<path d="M372 176 C 484 296 570 460 618 606 H372 Z" fill="${PAPIER}"/>
       <path d="M318 626 H706 L652 712 C 602 728 422 728 372 712 Z" fill="${PAPIER}"/>
       <rect x="312" y="764" width="400" height="24" rx="12" fill="${PAPIER}" opacity="0.75"/>
       <rect x="360" y="820" width="304" height="20" rx="10" fill="${PAPIER}" opacity="0.45"/>`
    )
  },
  {
    id: '4-voile-mer',
    nom: 'La voile sur la mer',
    note: 'Encre et vert : la toile blanche se pose sur l’eau.',
    svg: svg(
      ENCRE,
      `<path d="M96 690 H928 V928 H96 Z" fill="${VERT}"/>
       <path d="M372 190 C 492 318 580 500 626 646 H372 Z" fill="${PAPIER}"/>`
    )
  },
  {
    id: '5-boussole',
    nom: 'La boussole',
    note: 'La navigation sans le bateau : un anneau, une aiguille pleine.',
    svg: svg(
      ENCRE,
      `<circle cx="512" cy="512" r="286" fill="none" stroke="${PAPIER}" stroke-width="104"/>
       <path d="M512 300 404 512 512 724 620 512 Z" fill="${VERT}"/>`
    )
  },
  {
    id: '6-jour',
    nom: 'Le jour',
    note: 'Tuile papier, voile corail, coque encre : l’icône à l’endroit.',
    svg: svg(
      PAPIER,
      `<path d="M356 208 C 462 340 556 520 604 660 H356 Z" fill="${CORAIL}"/>
       <path d="M296 680 H716 L660 782 C 610 800 410 800 360 782 Z" fill="${ENCRE}"/>`
    )
  }
]

const dossier = __dirname
for (const c of concepts) fs.writeFileSync(path.join(dossier, `${c.id}.svg`), c.svg)

const img = (c, px) =>
  `<img src="${c.id}.svg" width="${px}" height="${px}" alt="${c.nom} en ${px} pixels">`

const bloc = (c) => `
  <article class="carte">
    <header><span class="num">${c.id.split('-')[0]}</span><h3>${c.nom}</h3></header>
    <p class="note">${c.note}</p>
    <div class="grand">${img(c, 200)}</div>
    <div class="petits">${[128, 64, 32, 16].map((px) => `<figure>${img(c, px)}<figcaption>${px}</figcaption></figure>`).join('')}</div>
  </article>`

fs.writeFileSync(
  path.join(dossier, 'maquette.html'),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Vela — six directions d’icône</title>
<style>
  * { box-sizing: border-box }
  body { margin:0; padding:44px 48px 52px; background:#EFEEE8; color:#131512;
    font: 14px/1.5 ui-sans-serif, -apple-system, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased }
  h1 { font: 700 30px/1.15 ui-sans-serif, sans-serif; letter-spacing:-.02em; margin:0 0 6px }
  .chapeau { margin:0 0 30px; max-width: 56ch; color:#4C514A }
  .grille { display:grid; grid-template-columns: repeat(3, 1fr); gap:22px }
  .carte { background:#fff; border-radius:6px; padding:20px 20px 16px;
    box-shadow: 0 1px 0 rgba(19,21,18,.08), 0 10px 26px rgba(19,21,18,.05) }
  header { display:flex; align-items:baseline; gap:10px }
  .num { font: 600 11px/1 ui-monospace, monospace; color:#1A7A5E;
    border:1px solid rgba(26,122,94,.35); border-radius:2px; padding:4px 6px }
  h3 { font: 600 17px/1.2 ui-sans-serif, sans-serif; margin:0; letter-spacing:-.01em }
  .note { margin:6px 0 16px; color:#4C514A; font-size:13px; min-height:38px }
  .grand { display:flex; justify-content:center; padding:6px 0 18px }
  .petits { display:flex; align-items:flex-end; gap:18px; justify-content:center;
    border-top:1px solid rgba(19,21,18,.1); padding-top:16px }
  figure { margin:0; text-align:center }
  figcaption { margin-top:6px; font-size:10px; color:#767B72 }
  img { display:block }
  .pied { margin-top:26px; color:#4C514A; font-size:13px; max-width:70ch }
  .pied b { color:#131512 }
  @media print { body { background:#fff } .carte { box-shadow:none; border:1px solid #ddd } }
</style></head><body>
  <h1>Vela — six directions d’icône</h1>
  <p class="chapeau">Même palette que le site : encre #0F1311, vert #1A7A5E, papier #F7F6F2,
  corail #E8805A. Un aplat par forme, aucun dégradé, aucun détail qui meurt à 32 px.</p>
  <div class="grille">${concepts.map(bloc).join('')}</div>
  <p class="pied"><b>Lecture :</b> la grande vignette est la taille du Dock en grand, la rangée
  du bas est la vraie question — 32 et 16 px, où tout se joue. Dis-moi le numéro retenu :
  je le pousse dans les trois maîtres (normal, petites tailles, barre de menus), je regénère
  .icns/.ico/favicon/visuel de partage et je publie.</p>
</body></html>`
)
console.log('maquette écrite : ' + concepts.map((c) => c.nom).join(' · '))
