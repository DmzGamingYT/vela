/* Génère /confidentialite/index.html depuis la liste de flux de l'application.
   Source unique : src/shared/network.ts (celle que le test d'audit surveille).
   Usage : node site/tools/privacy.mjs */
import { buildSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(here, '..')
const publicRoot = path.join(siteRoot, 'public')
const projectRoot = path.resolve(siteRoot, '..')

const bundlePath = path.join(siteRoot, 'tools/.network.bundle.cjs')
buildSync({
  entryPoints: [path.join(projectRoot, 'src/shared/network.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
  outfile: bundlePath
})

const require = createRequire(import.meta.url)
const { NETWORK_FLOWS } = require(bundlePath)
fs.rmSync(bundlePath, { force: true })

const GROUP_LABELS = {
  meteo: 'Météo de l’accueil',
  recherche: 'Moteur de recherche',
  tunnel: 'Tunnel de recherche',
  modeles: 'Modèles et agent',
  journal: 'Journal Letterboxd',
  'mises-a-jour': 'Mises à jour',
  pages: 'Pages et icônes',
  extensions: 'Lecture des planches'
}

const ORDER = ['meteo', 'recherche', 'tunnel', 'modeles', 'journal', 'mises-a-jour', 'pages', 'extensions']

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const row = (flow) => {
  const local = flow.local ? ' class="is-local"' : ''
  const off = flow.off === null ? 'Aucun réglage : la requête a lieu.' : flow.off
  // Les hôtes sont ceux que l’audit réseau surveille. On n’affiche que ceux
  // qui ajoutent une information : inutile de répéter la destination quand
  // elle est déjà écrite en clair au-dessus.
  const extra = flow.hosts.filter((host) => !flow.target.toLowerCase().includes(host.toLowerCase()))
  const hosts = extra.length ? `<span class="hosts">${extra.map(esc).join(' · ')}</span>` : ''
  const note = flow.local ? '<span class="off">Sur votre machine</span>' : ''
  return `                <tr${local}>
                  <td class="dest"><span class="name">${esc(flow.label)}</span>${esc(flow.target)}${hosts}${note}</td>
                  <td>${esc(flow.trigger)}</td>
                  <td>${esc(flow.data)}</td>
                  <td class="off">${esc(off)}</td>
                </tr>`
}

const block = (category) => {
  const flows = NETWORK_FLOWS.filter((flow) => flow.category === category)
  if (!flows.length) return ''
  return `          <h2 class="group-title">${esc(GROUP_LABELS[category] || category)}</h2>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Destination</th>
                  <th scope="col">Déclencheur</th>
                  <th scope="col">Ce qui part</th>
                  <th scope="col">Comment l’éviter</th>
                </tr>
              </thead>
              <tbody>
${flows.map(row).join('\n')}
              </tbody>
            </table>
          </div>`
}

const template = fs.readFileSync(path.join(here, 'privacy.template.html'), 'utf8')
const html = template
  .replace('{{FLOWS}}', ORDER.map(block).filter(Boolean).join('\n'))
  .replace(/\{\{FLOW_COUNT\}\}/g, String(NETWORK_FLOWS.length))

const target = path.join(publicRoot, 'confidentialite/index.html')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, html)

const hosts = NETWORK_FLOWS.filter((flow) => flow.hosts.length).reduce((sum, flow) => sum + flow.hosts.length, 0)
console.log(
  JSON.stringify(
    { target: path.relative(projectRoot, target), flows: NETWORK_FLOWS.length, hosts, bytes: Buffer.byteLength(html) },
    null,
    1
  )
)
