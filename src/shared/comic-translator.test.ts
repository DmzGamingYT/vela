import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Test d'intégration du fournisseur de vision hors application.
 *
 * Il n'est pas ignoré par confort : sans `TRANSLATOR_MODEL` (et une clé ou un
 * serveur local), il n'y a rien à joindre, et vitest le marque `skipped`. Dès
 * qu'un fournisseur est configuré, le test exige une réponse exploitable — ou
 * un refus explicitement motivé, jamais un faux succès.
 */
const require = createRequire(import.meta.url)
const translator = require('../../scripts/translator.cjs') as {
  config: () => { configured: boolean; reason: string }
  vision: (cfg: unknown, dataUrl: string, timeoutMs?: number) => Promise<{ ok: boolean; texte?: string; error?: string }>
}

const cfg = translator.config()

// 1×1 PNG transparent : suffisant pour vérifier que la requête part et revient.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe.skipIf(!cfg.configured)('fournisseur de vision (réel)', () => {
  it('répond, ou refuse en le disant', async () => {
    const result = await translator.vision(cfg, PNG, 20_000)
    expect(result).toHaveProperty('ok')
    if (result.ok) expect(String(result.texte || '').length).toBeGreaterThan(0)
    else expect(String(result.error || '').length).toBeGreaterThan(0)
  }, 30_000)
})
