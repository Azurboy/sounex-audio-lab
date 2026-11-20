import type { AudioCue } from '../lib/measurement'
import { formatMarkTime } from '../lib/time'

export function AudioCues({ cues, onListen }: { cues: AudioCue[]; onListen: (start: number, end: number) => void }) {
  if (!cues.length) return null
  return (
    <div className="cues" role="group" aria-label="回听原声">
      {cues.map(cue => (
        <button type="button" className="cue" key={cue.start + '/' + cue.end + '/' + cue.label}
          aria-label={'回听' + cue.label + '，' + formatMarkTime(cue.start) + ' 至 ' + formatMarkTime(cue.end)}
          onClick={() => onListen(cue.start, cue.end)}>
          <span aria-hidden="true">▷</span><time>{formatMarkTime(cue.start)}</time><span>{cue.label}</span>
        </button>
      ))}
    </div>
  )
}
