/**
 * Conversions de charge IPC partagées.
 *
 * Ces deux fonctions vivaient au-dessus de la classe `Browser`. Les modules qui
 * prennent une part de ses mutations les utilisent aussi : elles sont ici une
 * seule fois.
 */

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asId(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Identifiant invalide.')
  return value
}
