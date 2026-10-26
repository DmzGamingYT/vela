import { describe, expect, it } from 'vitest'
import { demoNote } from './agent'

describe('note générée sans modèle', () => {
  it('étiquette le repli et retire le Markdown des phrases reprises', () => {
    const text = demoNote({
      title: 'Projet TFE',
      url: 'https://example.org/tfe',
      text: '## Plan\n\n- [ ] Introduction avec une phrase assez longue pour être retenue.\n- [x] Corpus déjà rassemblé et documenté en détail.'
    })
    expect(text).toContain('Mode démo')
    expect(text).toContain('## Projet TFE')
    expect(text).toContain('https://example.org/tfe')
    expect(text).toContain('## Points clés')
    expect(text).toContain('## Plan d’action')
    expect(text).not.toContain('[ ]')
    expect(text).not.toContain('- [x]')
  })

  it('reste honnête quand la page est trop courte', () => {
    const text = demoNote({ title: 'Vide', text: 'Trop court.' })
    expect(text).toContain('pas assez de texte')
  })
})
