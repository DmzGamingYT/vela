/**
 * La ville choisie pour la météo de l'accueil.
 *
 * Elle vit dans le stockage local du renderer, pas dans vela.json : la page
 * d'accueil et la page Confidentialité doivent lire la même chose, d'où ce
 * module minuscule plutôt que deux clés qui dérivent.
 */

export const WEATHER_PLACE_KEY = 'vela.home.place'

export interface WeatherPlace {
  name: string
  country?: string
  latitude: number
  longitude: number
}

type StorageLike = Pick<Storage, 'getItem'>

function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** null tant qu'aucune ville n'a été validée : aucune requête météo. */
export function readWeatherPlace(store: StorageLike | null = storage()): WeatherPlace | null {
  if (!store) return null
  try {
    const raw = JSON.parse(store.getItem(WEATHER_PLACE_KEY) ?? 'null') as Partial<WeatherPlace> | null
    if (!raw || typeof raw.name !== 'string') return null
    if (typeof raw.latitude !== 'number' || typeof raw.longitude !== 'number') return null
    return {
      name: raw.name,
      country: typeof raw.country === 'string' ? raw.country : undefined,
      latitude: raw.latitude,
      longitude: raw.longitude
    }
  } catch {
    return null
  }
}
