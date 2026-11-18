import { useEffect, useState } from 'react'
import { store } from './storage'

export const LOCATION = { name: 'Brooklyn, NY', lat: 40.6782, lon: -73.9442, tz: 'America/New_York' }

export interface Weather {
  fetchedAt: number
  current: { temp: number; feels: number; code: number; wind: number; humidity: number; isDay: boolean }
  today: { hi: number; lo: number; precip: number; sunrise: string; sunset: string }
  hours: { time: string; temp: number; precip: number; code: number }[]
  days: { date: string; hi: number; lo: number; precip: number; code: number }[]
}

const URL_ =
  'https://api.open-meteo.com/v1/forecast?' +
  new URLSearchParams({
    latitude: String(LOCATION.lat),
    longitude: String(LOCATION.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: LOCATION.tz,
    forecast_days: '4',
  })

const CACHE_KEY = 'weather-cache'
const MAX_AGE = 30 * 60_000

/* eslint-disable @typescript-eslint/no-explicit-any */
function parse(d: any): Weather {
  const nowIso = d.current.time as string
  const startIdx = Math.max(0, (d.hourly.time as string[]).findIndex((t) => t >= nowIso.slice(0, 13)))
  return {
    fetchedAt: Date.now(),
    current: {
      temp: d.current.temperature_2m,
      feels: d.current.apparent_temperature,
      code: d.current.weather_code,
      wind: d.current.wind_speed_10m,
      humidity: d.current.relative_humidity_2m,
      isDay: d.current.is_day === 1,
    },
    today: {
      hi: d.daily.temperature_2m_max[0],
      lo: d.daily.temperature_2m_min[0],
      precip: d.daily.precipitation_probability_max[0] ?? 0,
      sunrise: d.daily.sunrise[0],
      sunset: d.daily.sunset[0],
    },
    hours: Array.from({ length: 6 }, (_, i) => startIdx + 1 + i * 2).map((i) => ({
      time: d.hourly.time[i],
      temp: d.hourly.temperature_2m[i],
      precip: d.hourly.precipitation_probability[i] ?? 0,
      code: d.hourly.weather_code[i],
    })),
    days: (d.daily.time as string[]).slice(1).map((date, i) => ({
      date,
      hi: d.daily.temperature_2m_max[i + 1],
      lo: d.daily.temperature_2m_min[i + 1],
      precip: d.daily.precipitation_probability_max[i + 1] ?? 0,
      code: d.daily.weather_code[i + 1],
    })),
  }
}

export function useWeather() {
  const [data, setData] = useState<Weather | null>(() => store.get<Weather | null>(CACHE_KEY, null))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async (force = false) => {
      const cached = store.get<Weather | null>(CACHE_KEY, null)
      if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE) return
      try {
        const res = await fetch(URL_)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const w = parse(await res.json())
        if (cancelled) return
        store.set(CACHE_KEY, w)
        setData(w)
        setError(null)
      } catch {
        if (!cancelled) setError('Weather is unavailable right now.')
      }
    }
    load()
    const id = window.setInterval(() => load(), MAX_AGE)
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return { data, error }
}

/** WMO weather codes -> label and icon. */
export function describe(code: number, isDay = true): { label: string; icon: string } {
  if (code === 0) return { label: 'Clear', icon: isDay ? '☀️' : '🌙' }
  if (code === 1) return { label: 'Mostly clear', icon: isDay ? '🌤️' : '🌙' }
  if (code === 2) return { label: 'Partly cloudy', icon: '⛅' }
  if (code === 3) return { label: 'Overcast', icon: '☁️' }
  if (code === 45 || code === 48) return { label: 'Fog', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: '🌦️' }
  if (code >= 61 && code <= 67) return { label: code >= 65 ? 'Heavy rain' : 'Rain', icon: '🌧️' }
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: '🌨️' }
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: '🌦️' }
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: '🌨️' }
  if (code >= 95) return { label: 'Thunderstorms', icon: '⛈️' }
  return { label: 'Unknown', icon: '🌡️' }
}
