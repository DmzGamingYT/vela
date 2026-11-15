import { describe, expect, it } from 'vitest'
import { normalizeSkillCommand, sanitizeSkills, SKILL_LIMIT } from './skills'

describe('commandes de skill', () => {
  it('enlève la barre, les espaces et la casse', () => {
    expect(normalizeSkillCommand(' /Résume En 3 ')).toBe('résume-en-3')
    expect(normalizeSkillCommand('///citer')).toBe('citer')
    expect(normalizeSkillCommand(42)).toBe('')
  })
})

describe('skills enregistrées', () => {
  it('garde l’ordre et complète le libellé manquant', () => {
    const skills = sanitizeSkills([
      { id: 'a', command: '/résumer', prompt: 'Résume.' },
      { id: 'b', command: 'citer', label: 'Citer', prompt: 'Cite.' }
    ])
    expect(skills.map((skill) => skill.command)).toEqual(['résumer', 'citer'])
    expect(skills[0].label).toBe('résumer')
    expect(skills[1].label).toBe('Citer')
  })

  it('écarte les doublons, les vides et les entrées illisibles', () => {
    const skills = sanitizeSkills([
      { command: 'résumer', prompt: 'Un.' },
      { command: 'RÉSUMER', prompt: 'Deux.' },
      { command: 'sans-instruction', prompt: '   ' },
      null,
      'texte',
      { command: '', prompt: 'Rien à taper.' }
    ])
    expect(skills).toHaveLength(1)
    expect(skills[0].prompt).toBe('Un.')
  })

  it('borne la liste', () => {
    const many = Array.from({ length: SKILL_LIMIT + 5 }, (_, index) => ({
      command: `skill-${index}`,
      prompt: 'Fais quelque chose.'
    }))
    expect(sanitizeSkills(many)).toHaveLength(SKILL_LIMIT)
  })

  it('ne rend rien pour autre chose qu’une liste', () => {
    expect(sanitizeSkills(undefined)).toEqual([])
    expect(sanitizeSkills({ command: 'x', prompt: 'y' })).toEqual([])
  })
})
