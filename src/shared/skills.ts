import type { Skill } from './types'

/** Au-delà, la palette demanderait plus de frappe que de clics. */
export const SKILL_LIMIT = 24

/**
 * Le mot tapé après « / » : sans barre, sans espace, en minuscules.
 *
 * Un espace devient un tiret plutôt que d’être mangé : « résume en 3 » reste
 * retrouvable en tapant les mots dans l’ordre.
 */
export function normalizeSkillCommand(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^\/+/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 24)
}

/**
 * Les skills enregistrées, bornées et débarrassées des entrées illisibles.
 *
 * Une commande en double est écartée : la palette en afficherait deux pour un
 * même geste. Une entrée sans instruction ne peut rien envoyer, elle part.
 */
export function sanitizeSkills(raw: unknown): Skill[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Skill[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Partial<Skill>
    const command = normalizeSkillCommand(entry.command)
    const prompt = typeof entry.prompt === 'string' ? entry.prompt.trim().slice(0, 800) : ''
    if (!command || !prompt || seen.has(command)) continue
    seen.add(command)
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim().slice(0, 80)
        : command
    const id =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim().slice(0, 60)
        : `skill-${command}`
    out.push({ id, command, label, prompt })
    if (out.length >= SKILL_LIMIT) break
  }

  return out
}
