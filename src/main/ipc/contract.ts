/**
 * Contrats du pont IPC.
 *
 * Un canal = une déclaration : la forme de sa charge, ce qu'il fait, et rien
 * d'autre. Le handler ne caste plus la charge (`payload as { id?: unknown }`) :
 * il reçoit la forme validée, ou n'est pas appelé du tout.
 *
 * Deux principes :
 *
 * - `ipcPolicy.ts` reste seul juge de **qui** peut appeler un canal. Ce module
 *   ne décide que de la **forme** ; le transport (`handle`, `on`) est fourni
 *   par l'appelant, donc déjà filtré par la politique d'émetteur.
 * - Une charge invalide est **ignorée**, pas levée : c'est ce que faisaient les
 *   gardes écrites à la main (`if (!Number.isFinite(index)) return`). Le
 *   renderer ne voit pas de rejet, il ne se passe rien.
 *
 * `Any` existe pour les canaux dont l'hôte valide lui-même la charge (par
 * exemple `host.pinTab(input: unknown)`) : le contrat dit alors explicitement
 * « forme libre, validée plus loin » au lieu de laisser un cast le suggérer.
 */
import type { WebContents } from 'electron'
import type { Handle, On } from './types'

/** Ce qu'un contrat a besoin de savoir d'un événement : qui l'a émis. */
export interface ContractEvent {
  sender: WebContents
}

/** Lit une valeur inconnue et rend la forme attendue, ou lève. */
export interface Field<T> {
  readonly label: string
  read(value: unknown): T
}

export function field<T>(label: string, read: (value: unknown) => T): Field<T> {
  return { label, read }
}

/** Objet brut d'une charge, ou objet vide. */
export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** Identifiant : chaîne non vide. Sert aussi aux textes qui ne peuvent être vides. */
export const Id: Field<string> = field('identifiant', (value) => {
  if (typeof value !== 'string' || !value) throw new Error('Charge invalide : identifiant.')
  return value
})

/** Texte quelconque, vide compris. */
export const Text: Field<string> = field('texte', (value) => {
  if (typeof value !== 'string') throw new Error('Charge invalide : texte.')
  return value
})

/** Nombre fini (`NaN` et `Infinity` sont refusés, comme les gardes d'origine). */
export const Num: Field<number> = field('nombre', (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Charge invalide : nombre.')
  return value
})

/** Booléen, avec la valeur de repli du handler quand la clé manque. */
export function flag(fallback = false): Field<boolean> {
  return field('booléen', (value) => (typeof value === 'boolean' ? value : fallback))
}

/** Champ facultatif : absent, il reste absent du résultat. */
export function optional<T>(inner: Field<T>): Field<T | undefined> {
  return field(inner.label, (value) => (value === undefined ? undefined : inner.read(value)))
}

/**
 * Objet à clés connues : les clés d'un contrat sont les seules recopiées, et
 * une clé facultative absente ne produit pas de `undefined` dans le résultat.
 */
export function shape<O extends object>(fields: { [K in keyof O]: Field<O[K]> }): Field<O> {
  return field('objet', (value) => {
    const source = record(value)
    const parsed: Record<string, unknown> = {}
    for (const [key, reader] of Object.entries(fields) as Array<[string, Field<unknown>]>) {
      const result = reader.read(source[key])
      if (result !== undefined) parsed[key] = result
    }
    return parsed as O
  })
}

/** Charge libre : l'hôte la valide (voir l'en-tête). */
export const Any: Field<unknown> = field('charge libre', (value) => value)

/** Aucune charge : le canal ne lit rien. */
export const None: Field<undefined> = field('aucune charge', () => undefined)

export interface Contract {
  readonly channel: string
  readonly mode: 'request' | 'event'
  read(value: unknown): unknown
  invoke(input: unknown, event: ContractEvent | undefined): unknown
}

/** Canal avec réponse (`ipcMain.handle`). */
export function request<I, O>(
  channel: string,
  input: Field<I>,
  run: (input: I, event: ContractEvent | undefined) => O
): Contract {
  return {
    channel,
    mode: 'request',
    read: input.read,
    invoke: (raw, event) => run(raw as I, event)
  }
}

/** Canal d'événement, sans réponse (`ipcMain.on`). */
export function listen<I>(
  channel: string,
  input: Field<I>,
  run: (input: I, event: ContractEvent) => void
): Contract {
  return {
    channel,
    mode: 'event',
    read: input.read,
    invoke: (raw, event) => {
      if (!event) return undefined
      return run(raw as I, event)
    }
  }
}

/**
 * `undefined` est une valeur valide (`None`) : le refus est donc un résultat
 * distinct, pas une sentinelle dans la valeur.
 */
type Reading = { ok: true; value: unknown } | { ok: false }

function validate(contract: Contract, payload: unknown): Reading {
  try {
    return { ok: true, value: contract.read(payload) }
  } catch {
    return { ok: false }
  }
}

/** Branche tous les contrats sur le transport fourni (déjà filtré par émetteur). */
export function bindContracts(contracts: readonly Contract[], handle: Handle, on: On): void {
  for (const contract of contracts) {
    if (contract.mode === 'event') {
      on(contract.channel, (event, payload) => {
        const read = validate(contract, payload)
        if (!read.ok) return
        contract.invoke(read.value, event)
      })
      continue
    }
    handle(contract.channel, (payload, event) => {
      const read = validate(contract, payload)
      if (!read.ok) return undefined
      return contract.invoke(read.value, event)
    })
  }
}
