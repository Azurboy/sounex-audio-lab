import { formatTime } from '../lib/time'

type Props = {
  playing: boolean
  currentTime: number
  duration: number
  label: string
  onToggle: () => void
  onSeek: (time: number) => void
}

export function Player({ playing, currentTime, duration, label, onToggle, onSeek }: Props) {
  return (
    <div className="player">
      <button type="button" className="player-toggle" aria-label={playing ? '暂停' : '播放'} onClick={onToggle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d={playing ? 'M3 2h3v12H3zM10 2h3v12h-3z' : 'M4 2.1v11.8L13.5 8z'} />
        </svg>
      </button>
      <h1 className="player-meta" title={label}>{label}</h1>
      <span className="player-times">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <input className="scrub" type="range" min={0} max={duration} step={0.01} value={Math.min(currentTime, duration)}
        aria-label="播放进度" aria-valuetext={formatTime(currentTime)} onChange={event => onSeek(Number(event.target.value))} />
    </div>
  )
}
