/**
 * Galerie d'avatars d'espace : vingt-quatre dessins SVG créés pour Vela,
 * libres de droits, sans police externe ni image distante. Chaque entrée se
 * rend avec ses deux teintes et son encre ; les variantes « initiales »
 * affichent la lettre de l'espace sur un motif.
 */

export type GalleryShape =
  | { kind: 'circle'; cx: number; cy: number; r: number; o?: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; o?: number }
  | { kind: 'path'; d: string; o?: number; stroke?: boolean }

export interface GalleryAvatar {
  id: string
  label: string
  from: string
  to: string
  ink: string
  /** Affiche l'initiale de l'espace au lieu du dessin. */
  initial?: boolean
  shapes: GalleryShape[]
}

/** Vingt-quatre avatars, tous lisibles à 18 px comme à 128 px. */
export const GALLERY_AVATARS: GalleryAvatar[] = [
  {
    id: 'sunrise',
    label: 'Soleil levant',
    from: '#FFB86B',
    to: '#FF6B6B',
    ink: '#FFF6E8',
    shapes: [
      { kind: 'circle', cx: 24, cy: 26, r: 11 },
      { kind: 'path', d: 'M8 38h32', stroke: true, o: 0.75 },
      { kind: 'path', d: 'M8 43h32', stroke: true, o: 0.45 }
    ]
  },
  {
    id: 'ocean',
    label: 'Onde',
    from: '#4FB6D8',
    to: '#2B6CB0',
    ink: '#EAF7FF',
    shapes: [
      { kind: 'path', d: 'M6 28c5-6 10-6 15 0s10 6 15 0 6-4 8 0', stroke: true },
      { kind: 'path', d: 'M6 36c5-6 10-6 15 0s10 6 15 0 6-4 8 0', stroke: true, o: 0.55 }
    ]
  },
  {
    id: 'forest',
    label: 'Feuille',
    from: '#3FA98A',
    to: '#276749',
    ink: '#EAFBF2',
    shapes: [
      { kind: 'path', d: 'M37 11C22 11 12 20 12 32c0 3 2 5 5 5 12 0 20-10 20-26Z', o: 0.95 },
      { kind: 'path', d: 'M14 36c3-8 8-13 15-17', stroke: true }
    ]
  },
  {
    id: 'berries',
    label: 'Baies',
    from: '#E93D82',
    to: '#8E4EC6',
    ink: '#FFF0F6',
    shapes: [
      { kind: 'circle', cx: 19, cy: 22, r: 8 },
      { kind: 'circle', cx: 30, cy: 27, r: 9, o: 0.85 },
      { kind: 'circle', cx: 21, cy: 34, r: 5, o: 0.6 }
    ]
  },
  {
    id: 'amber',
    label: 'Montagne',
    from: '#E5A100',
    to: '#F76B15',
    ink: '#FFF8E6',
    shapes: [
      { kind: 'path', d: 'M8 37 20 18l8 11 5-7 7 15Z' },
      { kind: 'circle', cx: 33, cy: 12, r: 4, o: 0.8 }
    ]
  },
  {
    id: 'night',
    label: 'Nuit',
    from: '#2D3748',
    to: '#151A22',
    ink: '#E6EDF7',
    shapes: [
      { kind: 'path', d: 'M29 8a14 14 0 1 0 11 22 12 12 0 0 1-11-22Z' },
      { kind: 'circle', cx: 34, cy: 14, r: 2, o: 0.9 },
      { kind: 'circle', cx: 39, cy: 22, r: 1.4, o: 0.6 }
    ]
  },
  {
    id: 'petals',
    label: 'Pétales',
    from: '#BF7AF0',
    to: '#7C3AED',
    ink: '#F7F0FF',
    shapes: [
      { kind: 'circle', cx: 24, cy: 16, r: 6 },
      { kind: 'circle', cx: 32, cy: 26, r: 6, o: 0.9 },
      { kind: 'circle', cx: 24, cy: 34, r: 6, o: 0.75 },
      { kind: 'circle', cx: 16, cy: 26, r: 6, o: 0.6 }
    ]
  },
  {
    id: 'mint',
    label: 'Anneau',
    from: '#3DD68C',
    to: '#0F766E',
    ink: '#E9FFF6',
    shapes: [
      { kind: 'circle', cx: 24, cy: 24, r: 12, o: 0.22 },
      { kind: 'path', d: 'M24 12a12 12 0 0 1 0 24', stroke: true },
      { kind: 'circle', cx: 24, cy: 12, r: 3 }
    ]
  },
  {
    id: 'graphite',
    label: 'Grille',
    from: '#6E6E73',
    to: '#2F2F33',
    ink: '#F1F1F4',
    shapes: [
      { kind: 'rect', x: 12, y: 12, w: 10, h: 10, rx: 2 },
      { kind: 'rect', x: 26, y: 12, w: 10, h: 10, rx: 2, o: 0.7 },
      { kind: 'rect', x: 12, y: 26, w: 10, h: 10, rx: 2, o: 0.7 },
      { kind: 'rect', x: 26, y: 26, w: 10, h: 10, rx: 2, o: 0.45 }
    ]
  },
  {
    id: 'gem',
    label: 'Losange',
    from: '#E5484D',
    to: '#8A1F24',
    ink: '#FFF1F1',
    shapes: [
      { kind: 'path', d: 'M24 9 38 24 24 39 10 24Z', o: 0.95 },
      { kind: 'path', d: 'M24 17 31 24 24 31 17 24Z', stroke: true }
    ]
  },
  {
    id: 'cloud',
    label: 'Nuage',
    from: '#52A9FF',
    to: '#0B5FBF',
    ink: '#EEF6FF',
    shapes: [
      { kind: 'circle', cx: 20, cy: 28, r: 8 },
      { kind: 'circle', cx: 29, cy: 24, r: 9, o: 0.95 },
      { kind: 'circle', cx: 35, cy: 30, r: 6, o: 0.8 },
      { kind: 'rect', x: 16, y: 30, w: 22, h: 7, rx: 3.5 }
    ]
  },
  {
    id: 'sand',
    label: 'Dunes',
    from: '#F2D0A4',
    to: '#C08A4E',
    ink: '#40301F',
    shapes: [
      { kind: 'path', d: 'M4 34c7-10 14-10 21 0s13 8 19 0v10H4Z', o: 0.9 },
      { kind: 'circle', cx: 32, cy: 16, r: 5 }
    ]
  },
  {
    id: 'bolt',
    label: 'Éclair',
    from: '#FFC53D',
    to: '#E5A100',
    ink: '#3B2A00',
    shapes: [{ kind: 'path', d: 'M27 8 15 27h8l-2 13 12-19h-8Z' }]
  },
  {
    id: 'orbit',
    label: 'Orbite',
    from: '#1E293B',
    to: '#0F172A',
    ink: '#DCE7FA',
    shapes: [
      { kind: 'circle', cx: 24, cy: 24, r: 9, o: 0.9 },
      { kind: 'path', d: 'M6 24c0-5 8-9 18-9s18 4 18 9-8 9-18 9S6 29 6 24Z', stroke: true, o: 0.6 }
    ]
  },
  {
    id: 'drop',
    label: 'Goutte',
    from: '#12A594',
    to: '#0B6B62',
    ink: '#E6FFFB',
    shapes: [{ kind: 'path', d: 'M24 8c8 9 13 15 13 21a13 13 0 0 1-26 0c0-6 5-12 13-21Z' }]
  },
  {
    id: 'bars',
    label: 'Colonnes',
    from: '#8E4EC6',
    to: '#4C1D95',
    ink: '#F4ECFF',
    shapes: [
      { kind: 'rect', x: 12, y: 26, w: 6, h: 12, rx: 2 },
      { kind: 'rect', x: 21, y: 18, w: 6, h: 20, rx: 2, o: 0.85 },
      { kind: 'rect', x: 30, y: 11, w: 6, h: 27, rx: 2, o: 0.7 }
    ]
  },
  {
    id: 'spark',
    label: 'Étincelle',
    from: '#5B5BD6',
    to: '#3A3AA8',
    ink: '#EEEEFF',
    shapes: [
      { kind: 'path', d: 'M24 8 27 21l13 3-13 3-3 13-3-13-13-3 13-3Z' },
      { kind: 'circle', cx: 36, cy: 12, r: 2, o: 0.7 }
    ]
  },
  {
    id: 'wave2',
    label: 'Houle',
    from: '#0EA5E9',
    to: '#0C4A6E',
    ink: '#ECFAFF',
    shapes: [
      { kind: 'path', d: 'M7 32c6-12 12-4 17-10s9-8 17-4', stroke: true },
      { kind: 'path', d: 'M7 40c7-10 13-3 18-8s9-7 16-3', stroke: true, o: 0.55 }
    ]
  },
  {
    id: 'rings',
    label: 'Anneaux',
    from: '#F76B15',
    to: '#9A3412',
    ink: '#FFF3E9',
    shapes: [
      { kind: 'path', d: 'M24 11a13 13 0 1 0 0 26 13 13 0 0 0 0-26Z', stroke: true },
      { kind: 'path', d: 'M17 24a7 7 0 0 1 14 0 7 7 0 0 1-14 0Z', o: 0.5 }
    ]
  },
  {
    id: 'checker',
    label: 'Damier',
    from: '#475569',
    to: '#1E293B',
    ink: '#E2E8F0',
    shapes: [
      { kind: 'rect', x: 12, y: 12, w: 12, h: 12, rx: 1 },
      { kind: 'rect', x: 24, y: 24, w: 12, h: 12, rx: 1 },
      { kind: 'rect', x: 24, y: 12, w: 12, h: 12, rx: 1, o: 0.3 },
      { kind: 'rect', x: 12, y: 24, w: 12, h: 12, rx: 1, o: 0.3 }
    ]
  },
  {
    id: 'mono-stripes',
    label: 'Initiales rayées',
    from: '#5B5BD6',
    to: '#2B2B78',
    ink: '#F2F2FF',
    initial: true,
    shapes: [
      { kind: 'path', d: 'M4 30 30 4M4 42 42 4M16 44 44 16', stroke: true, o: 0.35 }
    ]
  },
  {
    id: 'mono-dots',
    label: 'Initiales pointillées',
    from: '#E93D82',
    to: '#9D174D',
    ink: '#FFF0F7',
    initial: true,
    shapes: [
      { kind: 'circle', cx: 11, cy: 11, r: 2.4, o: 0.5 },
      { kind: 'circle', cx: 37, cy: 11, r: 2.4, o: 0.5 },
      { kind: 'circle', cx: 11, cy: 37, r: 2.4, o: 0.5 },
      { kind: 'circle', cx: 37, cy: 37, r: 2.4, o: 0.5 }
    ]
  },
  {
    id: 'mono-arc',
    label: 'Initiales en arc',
    from: '#12A594',
    to: '#065F55',
    ink: '#EAFFFB',
    initial: true,
    shapes: [{ kind: 'path', d: 'M8 40a16 16 0 0 1 32 0', stroke: true, o: 0.35 }]
  },
  {
    // L'œuf de l'ambiance Braise : un dessin original, pas une armoirie.
    id: 'dragon-egg',
    label: 'Œuf de dragon',
    from: '#8C2F14',
    to: '#3B120A',
    ink: '#FFD9AC',
    shapes: [
      { kind: 'path', d: 'M24 7c8 0 14 11 14 21 0 8-6 13-14 13S10 36 10 28C10 18 16 7 24 7Z', o: 0.95 },
      { kind: 'circle', cx: 20, cy: 21, r: 2.3, o: 0.3 },
      { kind: 'circle', cx: 28, cy: 21, r: 2.3, o: 0.3 },
      { kind: 'circle', cx: 24, cy: 28, r: 2.6, o: 0.3 },
      { kind: 'circle', cx: 17, cy: 30, r: 2, o: 0.24 },
      { kind: 'circle', cx: 31, cy: 30, r: 2, o: 0.24 },
      { kind: 'path', d: 'M22 14l4 6-3 5 4 5', stroke: true, o: 0.5 }
    ]
  },
  {
    id: 'mono-square',
    label: 'Initiales encadrées',
    from: '#E5A100',
    to: '#92400E',
    ink: '#FFF8E6',
    initial: true,
    shapes: [{ kind: 'rect', x: 9, y: 9, w: 30, h: 30, rx: 9, o: 0.25 }]
  }
]

export const GALLERY_BY_ID = new Map(GALLERY_AVATARS.map((entry) => [entry.id, entry]))

export function galleryAvatar(id: string | null | undefined): GalleryAvatar | null {
  if (!id) return null
  return GALLERY_BY_ID.get(id) ?? null
}
