import { useEffect, useRef, useState } from 'react'
import { fmt, type DayKey } from '../lib/dates'
import { describe, peakRain, useWeather } from '../lib/weather'
import { WeatherWidget } from './WeatherWidget'

/**
 * Slim date + weather line in the top bar. The full forecast opens in a
 * dropdown so it doesn't push tasks and notes down the page.
 */
export function DayLine({ today }: { today: DayKey }) {
  const { data: w } = useWeather()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const d = w && describe(w.current.code, w.current.isDay)
  // Flag a real chance of rain right in the top bar, so it's seen without opening the forecast.
  const peak = w && peakRain(w)
  const wet = peak && peak.chance >= 30 ? peak : null
  const wetAt = wet && new Date(wet.time).toLocaleTimeString(undefined, { hour: 'numeric' })

  return (
    <div className="dayline" ref={ref}>
      <span className="dayline-date">
        <span className="hide-sm">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <span className="show-sm">{fmt(today, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </span>
      <button
        className="wx-chip"
        aria-expanded={open}
        aria-label={
          w && d
            ? `${Math.round(w.current.temp)} degrees, ${d.label}.${wet ? ` ${wet.chance}% chance of rain around ${wetAt}.` : ''} Show forecast`
            : 'Show weather'
        }
        onClick={() => setOpen((o) => !o)}
      >
        {w && d ? (
          <>
            <span aria-hidden>{d.icon}</span>
            <strong>{Math.round(w.current.temp)}°</strong>
            <span className="muted hide-sm">
              {d.label} · H {Math.round(w.today.hi)}° L {Math.round(w.today.lo)}°
            </span>
            {wet && (
              <span className="wx-chip-rain" title={`${wet.chance}% chance of rain around ${wetAt}`}>
                💧{wet.chance}%<span className="hide-sm"> at {wetAt}</span>
              </span>
            )}
          </>
        ) : (
          <span className="muted">Weather</span>
        )}
      </button>
      {open && (
        <div className="wx-pop">
          <WeatherWidget />
        </div>
      )}
    </div>
  )
}
