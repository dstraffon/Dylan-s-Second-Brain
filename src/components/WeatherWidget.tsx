import { LOCATION, describe, useWeather } from '../lib/weather'
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
          <div className="wx-hours">
            {w.hours.map((h) => (
              <div key={h.time} className="wx-hour">
                <span className="muted small">{hourLabel(h.time)}</span>
                <span aria-hidden>{describe(h.code).icon}</span>
                <span>{Math.round(h.temp)}°</span>
                {h.precip >= 20 && <span className="rain small">{h.precip}%</span>}
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
