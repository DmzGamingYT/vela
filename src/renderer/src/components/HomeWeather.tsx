import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { WEATHER_PLACE_KEY as PLACE_KEY, readWeatherPlace, type WeatherPlace as Place } from '@shared/place'
import { Icon, type IconName } from './Icon'

/**
 * Horloge et météo de l'accueil.
 *
 * Aucune donnée n'est demandée tant que vous n'avez pas nommé une ville :
 * la seule requête réseau est alors faite par le renderer vers Open-Meteo,
 * pour cette ville et rien d'autre. Le dernier relevé reste sur l'appareil
 * (localStorage) et sert de repli hors ligne pendant trente minutes.
 */

interface Weather {
  temperature: number
  code: number
  isDay: boolean
  wind: number
  min: number
  max: number
}

interface Cached {
  at: number
  place: Place
  weather: Weather
}

const CACHE_KEY = 'vela.home.weather'
const TTL = 30 * 60_000

function readCache(place: Place): Weather | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null
    if (!raw || Date.now() - raw.at > TTL) return null
    if (raw.place?.latitude !== place.latitude || raw.place?.longitude !== place.longitude) return null
    return raw.weather ?? null
  } catch {
    return null
  }
}

/** Codes WMO → libellé français et icône, sans dépendance. */
function describe(code: number, isDay: boolean): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Ciel dégagé', icon: isDay ? 'sun' : 'moon' }
  if (code === 1 || code === 2) return { label: 'Peu nuageux', icon: 'cloud' }
  if (code === 3) return { label: 'Couvert', icon: 'cloud' }
  if (code === 45 || code === 48) return { label: 'Brouillard', icon: 'fog' }
  if (code >= 51 && code <= 57) return { label: 'Bruine', icon: 'rain' }
  if (code >= 61 && code <= 67) return { label: 'Pluie', icon: 'rain' }
  if (code >= 71 && code <= 77) return { label: 'Neige', icon: 'snow' }
  if (code >= 80 && code <= 82) return { label: 'Averse', icon: 'rain' }
  if (code >= 85 && code <= 86) return { label: 'Averse de neige', icon: 'snow' }
  if (code >= 95) return { label: 'Orage', icon: 'storm' }
  return { label: 'Temps calme', icon: 'cloud' }
}

function temperature(value: number): string {
  return `${Math.round(value)}°`
}

export default function HomeWeather({ onEditingChange }: { onEditingChange?: (editing: boolean) => void }) {
  const [now, setNow] = useState(() => new Date())
  const [place, setPlace] = useState<Place | null>(() => readWeatherPlace())
  const [weather, setWeather] = useState<Weather | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  // Le champ de ville ne s'affiche qu'après un clic : l'accueil garde deux
  // champs de recherche au plus (barre d'adresse et recherche).
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState('')
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Pendant la saisie d'une ville, l'accueil retire sa propre recherche :
  // deux champs visibles au maximum, jamais trois.
  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

  // L'heure s'affiche sans les secondes : un battement par minute suffit.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!place) {
      setWeather(null)
      setStatus('idle')
      return
    }
    const cached = readCache(place)
    if (cached) {
      setWeather(cached)
      setStatus('ready')
      return
    }
    let alive = true
    setStatus('loading')
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,weather_code,wind_speed_10m,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1'
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((json) => {
        const current = json?.current
        if (!current || typeof current.temperature_2m !== 'number') throw new Error('Réponse inattendue')
        const next: Weather = {
          temperature: current.temperature_2m,
          code: Number(current.weather_code ?? 3),
          isDay: current.is_day === 1,
          wind: Number(current.wind_speed_10m ?? 0),
          min: Number(json?.daily?.temperature_2m_min?.[0] ?? current.temperature_2m),
          max: Number(json?.daily?.temperature_2m_max?.[0] ?? current.temperature_2m)
        }
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), place, weather: next }))
        } catch {
          /* quota plein : le relevé reste en mémoire seulement */
        }
        if (!alive) return
        setWeather(next)
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [place])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const value = city.trim()
    if (!value || searching) return
    setSearching(true)
    setMessage(null)
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=1&language=fr&format=json`
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json()
      const hit = json?.results?.[0]
      if (!hit) {
        setMessage('Ville introuvable.')
        return
      }
      const next: Place = {
        name: String(hit.name),
        country:
          typeof hit.country === 'string'
            ? hit.country
            : typeof hit.country_code === 'string'
              ? hit.country_code
              : undefined,
        latitude: Number(hit.latitude),
        longitude: Number(hit.longitude)
      }
      try {
        localStorage.setItem(PLACE_KEY, JSON.stringify(next))
        localStorage.removeItem(CACHE_KEY)
      } catch {
        /* stockage indisponible : la ville reste pour cette session */
      }
      setPlace(next)
      setEditing(false)
      setCity('')
    } catch {
      setMessage('Recherche impossible pour le moment.')
    } finally {
      setSearching(false)
    }
  }

  /** Retire la ville et le relevé : plus aucune requête météo ne repartira. */
  const forgetPlace = (): void => {
    setPlace(null)
    setWeather(null)
    setStatus('idle')
    setMessage(null)
    setCity('')
    setEditing(true)
    try {
      localStorage.removeItem(PLACE_KEY)
      localStorage.removeItem(CACHE_KEY)
    } catch {
      /* stockage indisponible : la ville reste seulement en mémoire */
    }
  }

  const condition = weather ? describe(weather.code, weather.isDay) : null
  const hours = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(now)
  const detail = place
    ? 'Open-Meteo reçoit seulement les coordonnées de cette ville, une fois par demi-heure ; le relevé reste sur l’appareil.'
    : 'Aucune requête avant votre choix. En validant, le nom tapé part vers geocoding-api.open-meteo.com ; ensuite, seules les coordonnées vont à api.open-meteo.com, une fois par demi-heure.'
  const shortNote = message ?? (place ? 'Coordonnées seules, une fois par demi-heure.' : 'Aucune requête avant votre choix.')

  return (
    <section className="home-card home-day" aria-label="Heure et météo">
      <div className="day-clock">
        <p className="day-time">{hours}</p>
        <span className="day-zone">Heure locale</span>
      </div>

      {editing ? (
        <form className="day-form" onSubmit={submit}>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Ajouter une ville"
            aria-label="Ville pour la météo"
            spellCheck={false}
          />
          <button type="submit" disabled={searching || !city.trim()}>
            {searching ? 'Cherche…' : 'Voir'}
          </button>
          <button
            type="button"
            className="day-cancel"
            onClick={() => {
              setEditing(false)
              setCity('')
              setMessage(null)
            }}
          >
            Annuler
          </button>
        </form>
      ) : !place ? (
        <button type="button" className="day-add" onClick={() => setEditing(true)}>
          <Icon name="plus" size={13} />
          Ajouter une ville
        </button>
      ) : (
        <div className="day-weather">
          <span className="day-icon">
            <Icon name={condition?.icon ?? 'cloud'} size={18} />
          </span>
          <div className="day-copy">
            {status === 'ready' && weather && condition ? (
              <>
                <p className="day-temp">
                  {temperature(weather.temperature)}
                  <span className="day-range">
                    {temperature(weather.min)} / {temperature(weather.max)}
                  </span>
                </p>
                <p className="day-meta">
                  {condition.label} · vent {Math.round(weather.wind)} km/h
                </p>
              </>
            ) : (
              <p className="day-meta">{status === 'error' ? 'Météo indisponible' : 'Relevé en cours…'}</p>
            )}
            <p className="day-city">
              {place.name}
              {place.country ? `, ${place.country}` : ''}
              <button type="button" onClick={() => setEditing(true)} title="Changer de ville">
                Changer
              </button>
              <button type="button" onClick={forgetPlace} title="Retirer la ville et couper la météo">
                Retirer
              </button>
            </p>
          </div>
        </div>
      )}

      <p className="day-note">
        <span>{shortNote}</span>
        <button
          type="button"
          className="day-info"
          data-tip={detail}
          aria-label="Détail de la météo"
          aria-describedby="day-weather-detail"
        >
          <span aria-hidden="true">i</span>
        </button>
        <span id="day-weather-detail" className="sr-only">
          {detail}
        </span>
      </p>
    </section>
  )
}
