import { formatTime } from '../lib/time'

type Props = {
  playing: boolean
  currentTime: number
  duration: number
  label: string
  onToggle: () => void
  onSeek: (time: number) => void
  onScrubActivate?: () => void
}

export function Player({
  playing,
  currentTime,
  duration,
  label,
  onToggle,
  onSeek,
  onScrubActivate,
}: Props) {
  const safeDuration = duration > 0 && Number.isFinite(duration) ? duration : 0
  const progress = safeDuration > 0 ? Math.min(1, currentTime / safeDuration) : 0

  return (
    <div className="player">
      <button
        type="button"
        className="player-toggle"
        aria-label={playing ? '暂停' : '播放'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="player-times" aria-hidden="true">
        {formatTime(currentTime)} / {formatTime(safeDuration)}
      </div>
      <input
        className="scrub"
        type="range"
        min={0}
        max={safeDuration || 0}
        step={0.01}
        value={Math.min(currentTime, safeDuration)}
        aria-label="播放进度"
        style={{
          background: `linear-gradient(to right, var(--accent) ${progress * 100}%, rgba(41, 39, 31, 0.12) ${progress * 100}%)`,
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onScrubActivate?.()
        }}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <p className="player-meta">{label}</p>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 1.6v10.8L12.2 7 3 1.6Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 2h2.4v10H3V2Zm5.6 0H11v10H8.6V2Z" fill="currentColor" />
    </svg>
  )
}
