import { describe, expect, it } from 'vitest'
import {
  MAX_AVATAR_LENGTH,
  MAX_SHORTCUTS,
  SPACE_AVATARS,
  SPACE_BACKGROUNDS,
  SPACE_PRESETS,
  avatarIcon,
  avatarImage,
  isSpaceBackground,
  partitionFor,
  letterboxdUrl,
  normalizeLetterboxd,
  sanitizeSpaceAvatar,
  sanitizeSpaceBackground,
  sanitizeSpaceShortcuts,
  sanitizeWatchlist,
  shortcutsForSet,
  suggestShortcutSet
} from './space'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('avatars d’espace', () => {
  it('accepte le monogramme et les marques connues', () => {
    expect(sanitizeSpaceAvatar('monogram')).toBe('monogram')
    expect(sanitizeSpaceAvatar('icon:leaf')).toBe('icon:leaf')
    for (const mark of SPACE_AVATARS) expect(sanitizeSpaceAvatar(`icon:${mark.id}`)).toBe(`icon:${mark.id}`)
  })

  it('refuse une marque inconnue, une URL distante ou du HTML', () => {
    expect(sanitizeSpaceAvatar('icon:inconnu')).toBeNull()
    expect(sanitizeSpaceAvatar('https://exemple.fr/photo.png')).toBeNull()
    expect(sanitizeSpaceAvatar('<svg onload="alert(1)">')).toBeNull()
    expect(sanitizeSpaceAvatar('data:image/png;base64,AAAA')).toBeNull()
    expect(sanitizeSpaceAvatar(null)).toBeNull()
  })

  it('accepte une image locale et la borne en taille', () => {
    expect(sanitizeSpaceAvatar(`image:${PNG}`)).toBe(`image:${PNG}`)
    expect(sanitizeSpaceAvatar('image:data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    const huge = `image:data:image/png;base64,${'A'.repeat(MAX_AVATAR_LENGTH)}`
    expect(sanitizeSpaceAvatar(huge)).toBeNull()
  })

  it('retrouve l’image et l’icône stockées', () => {
    expect(avatarImage(`image:${PNG}`)).toBe(PNG)
    expect(avatarImage('icon:leaf')).toBeNull()
    expect(avatarIcon('icon:leaf')?.label).toBe('Feuille')
    expect(avatarIcon('monogram')).toBeNull()
  })
})

describe('ambiances d’espace', () => {
  it('retombe sur « aucune » pour une valeur inconnue', () => {
    expect(sanitizeSpaceBackground('aurora')).toBe('aurora')
    expect(sanitizeSpaceBackground('fluo')).toBe('none')
    expect(sanitizeSpaceBackground(undefined)).toBe('none')
    expect(isSpaceBackground('night')).toBe(true)
    expect(isSpaceBackground('')).toBe(false)
  })

  it('les vignettes livrées sont cohérentes', () => {
    const ids = SPACE_BACKGROUNDS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('none')
  })
})

describe('modèles d’espace', () => {
  it('chaque modèle produit un espace valide', () => {
    const seen = new Set<string>()
    for (const preset of SPACE_PRESETS) {
      expect(preset.id).not.toBe('')
      expect(seen.has(preset.id)).toBe(false)
      seen.add(preset.id)
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(sanitizeSpaceAvatar(preset.avatar)).toBe(preset.avatar)
      expect(isSpaceBackground(preset.background)).toBe(true)
    }
  })

  it('couvre les usages proposés', () => {
    const labels = SPACE_PRESETS.map((preset) => preset.label)
    expect(labels).toEqual(expect.arrayContaining(['Travail', 'Vie personnelle', 'Gaming', 'Études', 'Cinéma']))
  })

  it('livre un espace cinéma complet, avec ses six sites', () => {
    const cinema = SPACE_PRESETS.find((preset) => preset.id === 'cinema')
    expect(cinema).toBeDefined()
    expect(cinema?.avatar).toBe('icon:clap')
    expect(sanitizeSpaceAvatar(cinema?.avatar)).toBe('icon:clap')
    expect(isSpaceBackground(cinema?.background)).toBe(true)
    const sites = shortcutsForSet('cinema')
    expect(sites).toHaveLength(6)
    expect(sites.map((site) => site.title)).toEqual(
      expect.arrayContaining(['Letterboxd', 'AlloCiné', 'JustWatch'])
    )
    // Aucun doublon, et toutes les adresses passent le filtre http(s).
    expect(new Set(sites.map((site) => site.url)).size).toBe(sites.length)
  })

  it('reconnaît un espace cinéma d’après son nom', () => {
    expect(suggestShortcutSet('Cinéma')).toBe('cinema')
    expect(suggestShortcutSet('Films et séries')).toBe('cinema')
    expect(suggestShortcutSet('Séries du soir')).toBe('cinema')
  })
})

describe('liste à voir', () => {
  it('nettoie, dédoublonne et garde la marque « vu »', () => {
    const list = sanitizeWatchlist([
      { title: '  Dune   partie deux ', watched: true },
      { title: 'dune partie deux' },
      { title: '   ' },
      null,
      { title: 42 },
      { title: 'Alien', addedAt: 1700000000000 }
    ])
    expect(list.map((item) => item.title)).toEqual(['Dune partie deux', 'Alien'])
    expect(list[0].watched).toBe(true)
    expect(list[0].id).toBe(list[0].id)
    expect(list[1].addedAt).toBe(1700000000000)
    expect(sanitizeWatchlist('nope')).toEqual([])
  })

  it('borne un titre très long et la taille de la liste', () => {
    const long = sanitizeWatchlist([{ title: 'a'.repeat(400) }])
    expect(long[0].title.length).toBe(120)
    const many = sanitizeWatchlist(Array.from({ length: 260 }, (_, index) => ({ title: `Film ${index}` })))
    expect(many).toHaveLength(200)
  })
})

describe('compte Letterboxd', () => {
  it('accepte un nom, un @ ou une adresse complète', () => {
    expect(normalizeLetterboxd('Alessio')).toBe('alessio')
    expect(normalizeLetterboxd('@alessio-2')).toBe('alessio-2')
    expect(normalizeLetterboxd('https://letterboxd.com/ales_sio/')).toBe('ales_sio')
  })

  it('refuse le reste sans stocker d’adresse', () => {
    expect(normalizeLetterboxd('deux mots')).toBeNull()
    expect(normalizeLetterboxd('a')).toBeNull()
    expect(normalizeLetterboxd('javascript:alert(1)')).toBeNull()
    expect(normalizeLetterboxd('https://exemple.fr/autre-chose/')).toBeNull()
    expect(normalizeLetterboxd('')).toBeNull()
    expect(normalizeLetterboxd(undefined)).toBeNull()
  })

  it('construit les pages du compte, jamais une adresse libre', () => {
    expect(letterboxdUrl('alessio', '/films/')).toBe('https://letterboxd.com/alessio/films/')
    expect(letterboxdUrl(null, '/films/')).toBeNull()
    expect(letterboxdUrl('deux mots', '/films/')).toBeNull()
  })
})

describe('sites épinglés', () => {
  it('normalise une adresse sans schéma et retire les doublons', () => {
    const list = sanitizeSpaceShortcuts([
      { url: 'notion.so' },
      { url: 'https://notion.so/' },
      { url: 'https://github.com/vela', title: '  Vela  ' }
    ])
    expect(list).toHaveLength(2)
    expect(list[0].url).toBe('https://notion.so/')
    expect(list[0].title).toBe('notion.so')
    expect(list[1].title).toBe('Vela')
    expect(new Set(list.map((item) => item.id)).size).toBe(2)
  })

  it('refuse les schémas dangereux et les entrées cassées', () => {
    const list = sanitizeSpaceShortcuts([
      { url: 'javascript:alert(1)' },
      { url: 'file:///etc/passwd' },
      { url: 'https://localhost' },
      { url: 42 },
      null,
      { url: 'https://exemple.fr' }
    ])
    expect(list.map((item) => item.url)).toEqual(['https://exemple.fr/'])
  })

  it('borne la longueur de la barre', () => {
    const many = Array.from({ length: MAX_SHORTCUTS + 5 }, (_, index) => ({ url: `site${index}.fr` }))
    expect(sanitizeSpaceShortcuts(many)).toHaveLength(MAX_SHORTCUTS)
    expect(sanitizeSpaceShortcuts('nope')).toEqual([])
  })

  it('garde quarante sites, tous utilisables', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ url: `site${index}.fr`, title: `Site ${index}` }))
    const list = sanitizeSpaceShortcuts(many)
    expect(list).toHaveLength(40)
    expect(new Set(list.map((item) => item.id)).size).toBe(40)
  })

  it('reste rapide sur une barre très chargée (test de performance)', () => {
    // 600 entrées : le plafond doit couper avant, sans ralentir la lecture.
    const many = Array.from({ length: 600 }, (_, index) => ({ url: `site${index}.fr`, title: `Site ${index}` }))
    const start = performance.now()
    const list = sanitizeSpaceShortcuts(many)
    const elapsed = performance.now() - start
    expect(list).toHaveLength(MAX_SHORTCUTS)
    expect(elapsed).toBeLessThan(100)
  })

  it('chaque modèle livre une barre valide et propre à son usage', () => {
    for (const preset of SPACE_PRESETS) {
      const shortcuts = shortcutsForSet(preset.id)
      expect(shortcuts.length).toBeGreaterThan(0)
      // Sans doublon à l'intérieur d'une même barre.
      expect(shortcuts).toEqual(sanitizeSpaceShortcuts(shortcuts))
      expect(new Set(shortcuts.map((item) => item.url)).size).toBe(shortcuts.length)
    }
    expect(shortcutsForSet('inconnu')).toEqual([])
  })

  it('reconnaît le type d’espace d’après son nom, accents compris', () => {
    expect(suggestShortcutSet('Travail')).toBe('work')
    expect(suggestShortcutSet('Études 2026')).toBe('study')
    expect(suggestShortcutSet('Gaming')).toBe('gaming')
    expect(suggestShortcutSet('Développement')).toBe('dev')
    expect(suggestShortcutSet('Jardinage')).toBeNull()
  })
})

describe('partition d’un espace', () => {
  it('garde une partition valide telle quelle', () => {
    expect(partitionFor({ id: 'space-1', partition: 'persist:vela-space-1' })).toBe('persist:vela-space-1')
    expect(partitionFor({ id: 'space-1', partition: '  persist:perso  ' })).toBe('persist:perso')
  })

  it('calcule une partition stable quand elle manque', () => {
    // Le cas du plantage : un vela.json sans partition passait `undefined` à
    // Chromium, qui refusait l'argument et fermait l'app.
    expect(partitionFor({ id: 'space-1' })).toBe('persist:vela-space-1')
    expect(partitionFor({ id: 'space-1', partition: undefined })).toBe('persist:vela-space-1')
    expect(partitionFor({ id: 'space-2', partition: null })).toBe('persist:vela-space-2')
    expect(partitionFor({ id: 'space-3', partition: 42 })).toBe('persist:vela-space-3')
    expect(partitionFor({ id: 'space-1' })).toBe(partitionFor({ id: 'space-1' }))
  })

  it('refuse une valeur douteuse et ne partage jamais la session', () => {
    expect(partitionFor({ id: 'space-1', partition: '../partagee' })).toBe('persist:vela-space-1')
    expect(partitionFor({ id: 'space-1', partition: '' })).toBe('persist:vela-space-1')
    expect(partitionFor(null)).toBe('persist:vela-recovery')
    expect(partitionFor({ id: '../' })).toBe('persist:vela-recovery')
    expect(partitionFor({ id: 'space-1' })).not.toBe(partitionFor({ id: 'space-2' }))
  })
})
