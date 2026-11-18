import { LOCATION, describe, rainSummary, useWeather, type RainHour } from '../lib/weather'
import { Card } from './Card'

const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric' })
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const dayLabel = (date: string) => new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })

export function WeatherWidget() {
  const { data: w, error } = useWeather()

  return (
    <Card title={LOCATION.name} className="weather" id="weather">
      {!w ? (
        <p className="empty">{error ?? 'Loading weather…'}</p>
      ) : (
        <>
          <div className="wx-now">
            <span className="wx-icon" aria-hidden>
              {describe(w.current.code, w.current.isDay).icon}
            </span>
            <div>
              <div className="wx-temp">{Math.round(w.current.temp)}°</div>
              <div className="muted">{describe(w.current.code, w.current.isDay).label}</div>
            </div>
            <div className="wx-facts">
              <div>
                H {Math.round(w.today.hi)}° · L {Math.round(w.today.lo)}°
              </div>
              <div className="muted">Feels {Math.round(w.current.feels)}°</div>
              <div className="muted">
                💧 {w.today.precip}% · 💨 {Math.round(w.current.wind)} mph
              </div>
            </div>
          </div>
          {w.rain && w.rain.length > 0 && <RainStrip hours={w.rain} summary={rainSummary(w)} />}
          <div className="wx-hours">
            {w.hours.map((h) => (
              <div key={h.time} className="wx-hour">
                <span className="muted small">{hourLabel(h.time)}</span>
                <span aria-hidden>{describe(h.code).icon}</span>
                <span>{Math.round(h.temp)}°</span>
                {/* The rain strip above shows these chances hour by hour, so skip them here when it's there. */}
                {!w.rain?.length && h.precip >= 20 && <span className="rain small">{h.precip}%</span>}
              </div>
            ))}
          </div>
          <div className="wx-days">
            {w.days.map((d) => (
              <div key={d.date} className="wx-day">
                <span className="muted">{dayLabel(d.date)}</span>
                <span aria-hidden>{describe(d.code).icon}</span>
                <span>
                  {Math.round(d.hi)}° <span className="muted">{Math.round(d.lo)}°</span>
                </span>
              </div>
            ))}
          </div>
          <div className="muted small wx-sun">
            Sunrise {timeLabel(w.today.sunrise)} · Sunset {timeLabel(w.today.sunset)}
            {error && ' · showing last update'}
          </div>
        </>
      )}
    </Card>
  )
}

const amountLabel = (inches: number) => (inches >= 0.01 ? ` · ${inches.toFixed(2)} in` : '')

/** Hour-by-hour chance of rain to midnight: one bar per hour, height = chance. */
function RainStrip({ hours, summary }: { hours: RainHour[]; summary: string | null }) {
  const peak = Math.max(...hours.map((h) => h.chance))
  return (
    <div className="wx-rain">
      <div className="wx-rain-head">
        <span aria-hidden>💧</span>
        <span>{summary}</span>
      </div>
      <ol
        className="wx-rain-bars"
        style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}
        aria-label="Chance of rain by hour"
      >
        {hours.map((h, i) => {
          const label = `${hourLabel(h.time)}: ${h.chance}%${amountLabel(h.amount)}`
          // Label the start, then every third hour, so the axis never crowds.
          const showHour = i % 3 === 0
          const showPct = h.chance >= 20 && (h.chance === peak || i % 2 === 0)
          return (
            <li key={h.time} className="wx-rain-col" title={label} aria-label={label}>
              <span className="wx-rain-pct" aria-hidden>
                {showPct ? `${h.chance}` : ''}
              </span>
              <span className="wx-rain-track" aria-hidden>
                <span
                  className={'wx-rain-bar' + (h.chance >= 40 ? ' likely' : '')}
                  style={{ height: `${Math.max(h.chance, 4)}%` }}
                />
              </span>
              <span className="wx-rain-hour muted" aria-hidden>
                {showHour ? (i === 0 ? 'Now' : hourLabel(h.time).replace(' ', '').toLowerCase()) : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
