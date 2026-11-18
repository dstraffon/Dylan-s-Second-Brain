import { useEffect, useState } from 'react'
import { store } from './storage'

export const LOCATION = { name: 'Brooklyn, NY', lat: 40.6782, lon: -73.9442, tz: 'America/New_York' }

export interface Weather {
  fetchedAt: number
  current: { temp: number; feels: number; code: number; wind: number; humidity: number; isDay: boolean }
  today: { hi: number; lo: number; precip: number; sunrise: string; sunset: string }
  hours: { time: string; temp: number; precip: number; code: number }[]
  days: { date: string; hi: number; lo: number; precip: number; code: number }[]
  /** Every hour from now to midnight (at least 12): chance in %, amount in inches. */
  rain?: RainHour[]
}

export interface RainHour {
  time: string
  chance: number
  amount: number
  code: number
}

const URL_ =
  'https://api.open-meteo.com/v1/forecast?' +
  new URLSearchParams({
    latitude: String(LOCATION.lat),
    longitude: String(LOCATION.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: LOCATION.tz,
    forecast_days: '4',
  })

const CACHE_KEY = 'weather-cache'
const MAX_AGE = 30 * 60_000

/* eslint-disable @typescript-eslint/no-explicit-any */
function parse(d: any): Weather {
  const nowIso = d.current.time as string
  const times = d.hourly.time as string[]
  const startIdx = Math.max(0, times.findIndex((t) => t >= nowIso.slice(0, 13)))
  const today = nowIso.slice(0, 10)
  let endIdx = startIdx
  while (endIdx < times.length && (times[endIdx].startsWith(today) || endIdx - startIdx < 12)) endIdx++
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
    rain: times.slice(startIdx, endIdx).map((time, k) => ({
      time,
      chance: d.hourly.precipitation_probability[startIdx + k] ?? 0,
      amount: d.hourly.precipitation?.[startIdx + k] ?? 0,
      code: d.hourly.weather_code[startIdx + k],
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
      // Caches saved before hourly rain was added are refetched once.
      if (!force && cached?.rain && Date.now() - cached.fetchedAt < MAX_AGE) return
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

const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric' })

/** Highest chance of rain or snow over the rest of today, or null without hourly data. */
export function peakRain(w: Weather): RainHour | null {
  const today = w.rain?.filter((h) => h.time.slice(0, 10) === w.rain![0].time.slice(0, 10)) ?? []
  return today.reduce<RainHour | null>((best, h) => (!best || h.chance > best.chance ? h : best), null)
}

/**
 * One line for the rest of the day, for example
 * "Rain likely 2 PM to 6 PM, about 0.3 in" or "No rain expected today".
 */
export function rainSummary(w: Weather): string | null {
  const hours = w.rain
  if (!hours?.length) return null
  const day = hours[0].time.slice(0, 10)
  const today = hours.filter((h) => h.time.slice(0, 10) === day)
  const peak = peakRain(w)
  if (!peak || peak.chance < 20) return 'No rain expected today'
  const word = isSnow(peak.code) ? 'Snow' : 'Rain'
  const total = today.reduce((s, h) => s + h.amount, 0)
  const amount = total >= 0.01 ? `, about ${total < 0.1 ? total.toFixed(2) : total.toFixed(1)} in` : ''
  const likely = today.filter((h) => h.chance >= 40)
  if (!likely.length) return `Slight chance of ${word.toLowerCase()} around ${hourOf(peak.time)} (${peak.chance}%)${amount}`
  const first = likely[0].time
  const lastIdx = hours.indexOf(likely[likely.length - 1])
  const end = hours[lastIdx + 1]?.time
  const window = end ? `${hourOf(first)} to ${hourOf(end)}` : `from ${hourOf(first)}`
  return `${word} likely ${window}${amount}`
}
