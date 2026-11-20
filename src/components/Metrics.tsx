import type { AudioMark, Metric } from '../lib/measurement'
import { AudioCues } from './AudioCues'

type Props = { metrics: Metric[]; marks: AudioMark[]; onListen: (start: number, end: number) => void }

export function Metrics({ metrics, marks, onListen }: Props) {
  if (!metrics.length) return null
  return (
    <details className="metric-strip">
      <summary>声音指标<span className="metric-count">{metrics.length} 项</span></summary>
      <dl>
        {metrics.map(m => (
          <div className="metric-cell" key={m.id}>
            <dt>{m.label}</dt>
            <dd>{m.value}{m.note && <span className="note">{m.note}</span>}</dd>
          </div>
        ))}
      </dl>
      <AudioCues cues={marks} onListen={onListen} />
    </details>
  )
}
