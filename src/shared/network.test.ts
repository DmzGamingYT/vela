import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IGNORED_HOSTS, NETWORK_FLOWS, USER_OPENED_HOSTS, flowHosts, hostMatches } from './network'

const ROOT = process.cwd()

/** Fichiers livrés : ni tests, ni build, ni dépendances. */
function sources(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'out', 'dist', 'release'].includes(entry.name)) continue
      files.push(...sources(path))
      continue
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue
    if (/\.test\.(ts|tsx|js|mjs)$/.test(entry.name)) continue
    files.push(path)
  }
  return files
}

/** Hôtes littéraux d'un fichier, fragments de gabarit retirés. */
function hostsIn(text: string): string[] {
  const hosts: string[] = []
  for (const match of text.matchAll(/https?:\/\/([^\s"'`<>)\\]+)/g)) {
    const host = match[1]
      .split(/[/?#]/)[0]
      .replace(/\$\{[^}]*\}/g, '')
      .replace(/^\./, '')
      .replace(/:\d+$/, '')
      .replace(/[,;]+$/, '')
      .toLowerCase()
    if (!host || host.includes('$') || host.includes('{') || host.includes('*')) continue
    hosts.push(host)
  }
  return hosts
}

const files = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'userscripts'))]
const declared = [...flowHosts(), ...USER_OPENED_HOSTS, ...IGNORED_HOSTS]

describe('audit des destinations réseau', () => {
  it('ne laisse aucune destination hors de la liste', () => {
    const unknown: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const host of hostsIn(text)) {
        if (declared.some((entry) => hostMatches(host, entry))) continue
        const line = `${relative(ROOT, file)} → ${host}`
        if (!unknown.includes(line)) unknown.push(line)
      }
    }
    expect(
      unknown,
      `Destination inconnue. Ajoutez-la à NETWORK_FLOWS (si Vela la contacte) ou à USER_OPENED_HOSTS (si c’est un lien) dans src/shared/network.ts :\n${unknown.join('\n')}`
    ).toEqual([])
  })

  it('décrit chaque flux sans trou', () => {
    const ids = new Set<string>()
    for (const flow of NETWORK_FLOWS) {
      expect(flow.id, 'identifiant').toMatch(/^[a-z0-9-]+$/)
      expect(ids.has(flow.id), `identifiant dupliqué : ${flow.id}`).toBe(false)
      ids.add(flow.id)
      expect(flow.label.trim(), `libellé de ${flow.id}`).not.toBe('')
      expect(flow.target.trim(), `destination de ${flow.id}`).not.toBe('')
      expect(flow.trigger.trim(), `déclencheur de ${flow.id}`).not.toBe('')
      expect(flow.data.trim(), `données de ${flow.id}`).not.toBe('')
      for (const host of flow.hosts) {
        expect(host, `hôte de ${flow.id}`).toBe(host.toLowerCase())
        expect(host).not.toContain('http')
      }
    }
  })

  it('n’appelle jamais une destination réservée aux liens ouverts', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const line of text.split('\n')) {
        if (!/(?:net\.)?fetch\(/.test(line)) continue
        for (const host of USER_OPENED_HOSTS) {
          if (line.includes(host)) offenders.push(`${relative(ROOT, file)} → ${host}`)
        }
      }
    }
    expect(
      offenders,
      `Une destination de lien ouvert est appelée par du code : ${offenders.join(', ')}`
    ).toEqual([])
  })

  it('garde les points d’appel réseau dans une liste revue', () => {
    // Un nouveau fichier qui appelle fetch doit être ajouté ici après avoir été
    // inscrit dans NETWORK_FLOWS. C'est la partie que le test d'hôtes littéraux
    // ne peut pas voir quand l'URL est construite dans une variable.
    const reviewed = new Set([
      'src/main/agent.ts',
      'src/main/browser.ts',
      'src/main/comic.ts',
      'src/main/favicons.ts',
      'src/main/letterboxd.ts',
      'src/main/tunnel.ts',
      'src/main/updater.ts',
      'src/renderer/src/components/HomeWeather.tsx',
      // Script injecté dans les pages de BD : modèles et CDN OCR documentés.
      'userscripts/comic-translate.user.js'
    ])
    const callers = new Set<string>()
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (/(?:net\.)?fetch\(/.test(text)) callers.add(relative(ROOT, file).split('\\').join('/'))
    }
    expect(
      [...callers].filter((file) => !reviewed.has(file)),
      'Nouveau point d’appel réseau : documentez-le dans NETWORK_FLOWS puis ajoutez le fichier à la liste revue.'
    ).toEqual([])
  })

  it('n’oublie aucun hôte déclaré dans le code', () => {
    // Ces deux hôtes sont des cibles de redirection GitHub, pas des URL du
    // code : ils n'ont pas à apparaître littéralement dans les sources.
    const redirectOnly = new Set(['objects.githubusercontent.com', 'release-assets.githubusercontent.com'])
    const all = files
      .filter((file) => !file.endsWith('network.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    const unused = flowHosts().filter((host) => !redirectOnly.has(host) && !all.includes(host))
    expect(unused, `Hôte déclaré mais introuvable dans le code : ${unused.join(', ')}`).toEqual([])
  })

  it('distingue ce qui sort de ce qui reste sur la machine', () => {
    const local = NETWORK_FLOWS.filter((flow) => flow.local)
    expect(local.length, 'un flux local déclaré').toBeGreaterThan(0)
    for (const flow of local) {
      expect(flow.hosts.every((host) => host === 'localhost' || host === '127.0.0.1')).toBe(true)
    }
    const remote = NETWORK_FLOWS.filter((flow) => !flow.local && flow.hosts.length > 0)
    expect(remote.length).toBeGreaterThan(0)
  })
})
