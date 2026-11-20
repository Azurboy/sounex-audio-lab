import type { Answer, Metric } from '../data/sample'
import { formatTime } from '../lib/time'

export type Turn =
  | { id: string; role: 'user'; text: string }
  | {
      id: string
      role: 'assistant'
      thinking?: boolean
      paragraphs: string[]
      cues: Answer['cues']
      usedMetrics?: Metric[]
    }

type Props = {
  turns: Turn[]
  onSeekCue: (start: number) => void
  reducedMotion?: boolean
}

export function Thread({ turns, onSeekCue, reducedMotion }: Props) {
  if (turns.length === 0) return null

  return (
    <div className="thread" aria-live="polite">
      {turns.map((turn) =>
        turn.role === 'user' ? (
          <div
            className={`turn-user${reducedMotion ? '' : ' is-entering'}`}
            key={turn.id}
          >
            <span className="who">问</span>
            {turn.text}
          </div>
        ) : (
          <div className="turn-assistant" key={turn.id}>
            {turn.thinking ? (
              <div className="thinking" aria-label="正在听这段声音">
                <span className="thinking-label">正在听</span>
                <i /><i /><i />
              </div>
            ) : (
              <div className={reducedMotion ? undefined : 'reply-body'}>
                {turn.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {turn.cues.length > 0 && (
                  <div className="cues">
                    {turn.cues.map((cue) => (
                      <button
                        key={`${cue.start}-${cue.label}`}
                        type="button"
                        className="cue"
                        onClick={() => onSeekCue(cue.start)}
                      >
                        <time>{formatTime(cue.start)}</time>
                        <span>{cue.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {turn.usedMetrics && turn.usedMetrics.length > 0 && (
                  <div className="used-metrics">
                    <span className="used-metrics-label">用到的指标</span>
                    {turn.usedMetrics.map((m) => (
                      <span className="used-metric" key={m.id}>
                        <span className="used-metric-k">{m.label}</span>
                        <span className="used-metric-v">{m.value}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="disclaimer">AI 生成，仅供参考。</p>
              </div>
            )}
          </div>
        ),
      )}
    </div>
  )
}
