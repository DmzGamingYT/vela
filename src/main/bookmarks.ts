import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { BookmarkImportSource } from '@shared/types'

const run = promisify(execFile)

interface BrowserInstall {
  id: string
  label: string
  dir: string
}

function chromiumInstalls(): BrowserInstall[] {
  const home = homedir()
  if (process.platform === 'darwin') {
    const support = join(home, 'Library/Application Support')
    return [
      { id: 'chrome', label: 'Chrome', dir: join(support, 'Google/Chrome') },
      { id: 'brave', label: 'Brave', dir: join(support, 'BraveSoftware/Brave-Browser') },
      { id: 'edge', label: 'Microsoft Edge', dir: join(support, 'Microsoft Edge') },
      { id: 'chromium', label: 'Chromium', dir: join(support, 'Chromium') }
    ]
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData/Roaming')
    return [
      { id: 'chrome', label: 'Chrome', dir: join(appData, 'Google/Chrome/User Data') },
      { id: 'brave', label: 'Brave', dir: join(appData, 'BraveSoftware/Brave-Browser/User Data') },
      { id: 'edge', label: 'Microsoft Edge', dir: join(appData, 'Microsoft Edge/User Data') },
      { id: 'chromium', label: 'Chromium', dir: join(appData, 'Chromium/User Data') }
    ]
  }
  const config = join(home, '.config')
  return [
    { id: 'chrome', label: 'Chrome', dir: join(config, 'google-chrome') },
    { id: 'brave', label: 'Brave', dir: join(config, 'BraveSoftware/Brave-Browser') },
    { id: 'edge', label: 'Microsoft Edge', dir: join(config, 'microsoft-edge') },
    { id: 'chromium', label: 'Chromium', dir: join(config, 'chromium') }
  ]
}

interface ChromeNode {
  type?: string
  name?: string
  url?: string
  children?: ChromeNode[]
}

/** Parcourt l'arbre `roots` d'un fichier Bookmarks Chromium. */
function walkChromium(node: ChromeNode | undefined, out: { title: string; url: string }[], limit: number): void {
  if (!node || out.length >= limit) return
  if (node.type === 'url' && typeof node.url === 'string' && /^https?:/i.test(node.url)) {
    out.push({ title: (node.name ?? '').trim().slice(0, 160) || node.url, url: node.url })
  }
  for (const child of node.children ?? []) walkChromium(child, out, limit)
}

function readChromium(install: BrowserInstall, limit: number): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = []
  let profiles: string[] = []
  try {
    profiles = readdirSync(install.dir).filter((name) => {
      try {
        return statSync(join(install.dir, name, 'Bookmarks')).isFile()
      } catch {
        return false
      }
    })
  } catch {
    return out
  }
  for (const profile of profiles) {
    try {
      const raw = JSON.parse(readFileSync(join(install.dir, profile, 'Bookmarks'), 'utf8')) as {
        roots?: Record<string, ChromeNode>
      }
      for (const root of Object.values(raw.roots ?? {})) walkChromium(root, out, limit)
    } catch {
      // profil illisible : on continue avec les autres
    }
    if (out.length >= limit) break
  }
  return out
}

interface SafariNode {
  WebBookmarkType?: string
  URLString?: string
  URIDictionary?: { title?: string }
  Children?: SafariNode[]
}

function walkSafari(node: SafariNode | undefined, out: { title: string; url: string }[], limit: number): void {
  if (!node || out.length >= limit) return
  if (node.WebBookmarkType === 'WebBookmarkTypeLeaf' && typeof node.URLString === 'string' && /^https?:/i.test(node.URLString)) {
    out.push({
      title: (node.URIDictionary?.title ?? '').trim().slice(0, 160) || node.URLString,
      url: node.URLString
    })
  }
  for (const child of node.Children ?? []) walkSafari(child, out, limit)
}

async function readSafari(limit: number): Promise<{ title: string; url: string }[]> {
  if (process.platform !== 'darwin') return []
  const file = join(homedir(), 'Library/Safari/Bookmarks.plist')
  if (!existsSync(file)) return []
  try {
    // plutil lit le plist binaire sans dépendance ; sans autorisation disque,
    // la commande échoue et on renvoie simplement une liste vide.
    const { stdout } = await run('plutil', ['-convert', 'json', '-o', '-', file], { maxBuffer: 8 * 1024 * 1024 })
    const parsed = JSON.parse(stdout) as SafariNode
    const out: { title: string; url: string }[] = []
    walkSafari(parsed, out, limit)
    return out
  } catch {
    return []
  }
}

const LIMIT = 400

/**
 * Favoris des navigateurs installés, lus localement. Aucun fichier n'est
 * modifié et rien n'est envoyé : l'import reste une action de l'utilisateur.
 */
export async function detectBookmarks(): Promise<BookmarkImportSource[]> {
  const sources: BookmarkImportSource[] = []
  for (const install of chromiumInstalls()) {
    if (!existsSync(install.dir)) continue
    const urls = readChromium(install, LIMIT)
    if (urls.length > 0) {
      sources.push({ id: install.id, label: install.label, count: urls.length, urls })
    }
  }
  const safari = await readSafari(LIMIT)
  if (safari.length > 0) {
    sources.push({ id: 'safari', label: 'Safari', count: safari.length, urls: safari })
  }
  return sources
}
