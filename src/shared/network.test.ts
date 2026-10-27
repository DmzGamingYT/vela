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
