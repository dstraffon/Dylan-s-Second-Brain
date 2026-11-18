import { useEffect, useRef, useState } from 'react'
import { fmt, type DayKey } from '../lib/dates'
import { describe, useWeather } from '../lib/weather'
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

  return (
    <div className="dayline" ref={ref}>
      <span className="dayline-date">
        <span className="hide-sm">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <span className="show-sm">{fmt(today, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </span>
      <button
        className="wx-chip"
        aria-expanded={open}
        aria-label={w && d ? `${Math.round(w.current.temp)} degrees, ${d.label}. Show forecast` : 'Show weather'}
        onClick={() => setOpen((o) => !o)}
      >
        {w && d ? (
          <>
            <span aria-hidden>{d.icon}</span>
            <strong>{Math.round(w.current.temp)}°</strong>
            <span className="muted hide-sm">
              {d.label} · H {Math.round(w.today.hi)}° L {Math.round(w.today.lo)}°
            </span>
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
