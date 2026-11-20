import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { audioSession } from '../audio/session'
import { computeSpectrogram, freqToRatio, renderSpectrogram, type SpectrogramData } from '../audio/stft'
import { formatClock, formatMarkTime } from '../lib/time'

const frequencies = [{ hz: 8000, label: '8 kHz' }, { hz: 1000, label: '1k' }, { hz: 80, label: '80' }]
type Props = {
  src: string
  samples?: Float32Array
  duration: number
  currentTime: number
  playing: boolean
  reducedMotion: boolean
  onSeek: (time: number) => void
}

function axisTicks(duration: number) {
  if (duration <= 0) return []
  const unit = 10 ** Math.floor(Math.log10(duration / 4))
  const step = ([1, 2, 5, 10].find(n => n * unit >= duration / 5) ?? 10) * unit
  const ticks = [0]
  for (let i = 1; i * step < duration - step * 0.55; i++) ticks.push(i * step)
  return [...ticks, duration]
}

export function Spectrogram({ src, samples, duration, currentTime, playing, reducedMotion, onSeek }: Props) {
  const [data, setData] = useState<SpectrogramData | null>(null)
  const [error, setError] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const plot = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLSpanElement>(null)
  const pointer = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    setError(false)
    void computeSpectrogram(src, samples).then(
      next => { if (active) setData(next) },
      () => { if (active) setError(true) },
    )
    return () => { active = false }
  }, [src, samples])

  useEffect(() => {
    const el = canvas.current, box = plot.current, ctx = el?.getContext('2d')
    if (!el || !box || !ctx || !data) return
    function draw() {
      if (!el || !box || !ctx || !data) return
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(box.clientWidth * scale))
      const height = Math.max(1, Math.round(box.clientHeight * scale))
      el.width = width
      el.height = height
      renderSpectrogram(ctx, data, width, height)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(box)
    return () => observer.disconnect()
  }, [data])

  useEffect(() => {
    if (!playing || reducedMotion || duration <= 0) return
    let frame = 0
    const tick = () => {
      if (head.current) head.current.style.left = Math.min(100, 100 * audioSession.element.currentTime / duration) + '%'
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, reducedMotion, duration])

  function seekPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - rect.left) / Math.max(1, rect.width)
    onSeek(Math.min(1, Math.max(0, fraction)) * duration)
  }

  function seekKey(event: KeyboardEvent<HTMLDivElement>) {
    const positions: Record<string, number> = { ArrowLeft: currentTime - 1, ArrowRight: currentTime + 1, Home: 0, End: duration }
    if (!(event.key in positions)) return
    event.preventDefault()
    onSeek(Math.max(0, Math.min(duration, positions[event.key])))
  }

  return (
    <section className="exhibit" aria-label="声音频谱">
      <div className="spec-toolbar">
        <h2>声音频谱</h2>
        <span className="spec-legend"><i aria-hidden="true" />能量由浅至深</span>
      </div>
      <div className="spec-plot">
        <div className="spec-y" aria-hidden="true">
          {frequencies.map(tick => <span key={tick.hz} style={{ bottom: freqToRatio(tick.hz) * 100 + '%' }}>{tick.label}</span>)}
        </div>
        <div className="spec-canvas-wrap" ref={plot} role="slider" tabIndex={0} aria-label="频谱播放位置"
          aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.min(currentTime, duration)} aria-valuetext={formatMarkTime(currentTime)}
          onKeyDown={seekKey} onPointerDown={event => {
            if (event.button !== 0 || !event.isPrimary) return
            pointer.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            seekPointer(event)
          }}
          onPointerMove={event => { if (pointer.current === event.pointerId) seekPointer(event) }}
          onLostPointerCapture={() => { pointer.current = null }}>
          <canvas ref={canvas} aria-hidden="true" />
          {data ? <span ref={head} className="spec-playhead" aria-hidden="true"
            style={{ left: Math.min(100, 100 * currentTime / duration) + '%' }} />
            : <span className="spec-status" role="status">{error ? '暂时无法绘制频谱。' : '正在绘制频谱…'}</span>}
        </div>
      </div>
      <div className="spec-x" aria-hidden="true">
        {axisTicks(duration).map(t => <span key={t} style={{ left: t / duration * 100 + '%' }}>
          {duration < 4 ? formatMarkTime(t) : formatClock(t)}
        </span>)}
      </div>
    </section>
  )
}
