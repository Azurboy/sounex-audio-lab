import { METRICS } from '../data/sample'

export function Metrics() {
  return (
    <section className="metric-strip" aria-label="测得的声学量">
      <h2 className="section-label">测得的声学量</h2>
      <dl>
        {METRICS.map((m) => (
          <div className="metric-cell" key={m.id}>
            <dt>{m.label}</dt>
            <dd>
              {m.value}
              {m.note ? <span className="note">{m.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
