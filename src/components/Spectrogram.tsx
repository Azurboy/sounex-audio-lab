import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  UTTERANCES,
  formatProb,
  utteranceAt,
  type Utterance,
} from '../data/sample'
import { formatClock } from '../lib/time'
import { audioSession } from '../audio/session'
import {
  computeSpectrogram,
  freqToRatio,
  renderSpectrogram,
  type SpectrogramData,
} from '../audio/stft'

const FREQ_TICKS: { hz: number; label: string }[] = [
  { hz: 8000, label: '8k' },
  { hz: 4000, label: '4k' },
  { hz: 2000, label: '2k' },
  { hz: 1000, label: '1k' },
  { hz: 500, label: '500' },
  { hz: 250, label: '250' },
  { hz: 80, label: '80' },
]

const TIME_TICKS = [0, 5, 10, 15, 20, 23.72]

type Props = {
  src: string
  currentTime: number
  duration: number
  playing: boolean
  showLabels: boolean
  reducedMotion: boolean
  selectedId: string | null
  onSelect: (id: string, start: number) => void
  onSeek: (time: number) => void
  onSeekActivate?: () => void
}

export function Spectrogram({
  src,
  currentTime,
  duration,
  playing,
  showLabels,
  reducedMotion,
  selectedId,
  onSelect,
  onSeek,
  onSeekActivate,
}: Props) {
  const [data, setData] = useState<SpectrogramData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; moved: boolean } | null>(null)

  const headRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = headRef.current
    if (!el) return
    if (!playing || reducedMotion) return
    let frame = 0
    const tick = () => {
      const d = audioSession.element.duration
      const dur = Number.isFinite(d) && d > 0 ? d : duration
      if (dur > 0) {
        const p = Math.min(1, Math.max(0, audioSession.element.currentTime / dur))
        el.style.left = `${p * 100}%`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, reducedMotion, duration, data])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)
    setData(null)
    void computeSpectrogram(src)
      .then((spec) => {
        if (cancelled) return
        setData(spec)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : '无法绘制这段音频的频谱。')
      })
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !data) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      const pw = Math.max(1, Math.floor(width * dpr))
      const ph = Math.max(1, Math.floor(height * dpr))
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      renderSpectrogram(ctx, data, pw, ph)
    }

    draw()
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [data])

  const safeDuration =
    duration > 0 && Number.isFinite(duration)
      ? duration
      : data?.duration && data.duration > 0
        ? data.duration
        : 0

  const progress = safeDuration > 0 ? Math.min(1, Math.max(0, currentTime / safeDuration)) : 0
  const active = showLabels
    ? (UTTERANCES.find((u) => u.id === selectedId) ?? utteranceAt(currentTime) ?? null)
    : null

  const timeTicks = useMemo(() => {
    if (safeDuration <= 0) return TIME_TICKS
    return TIME_TICKS.filter((t, i) => t < safeDuration - 0.4 || i === TIME_TICKS.length - 1).map(
      (t, i, arr) => (i === arr.length - 1 ? safeDuration : t),
    )
  }, [safeDuration])

  function timeFromClientX(clientX: number): number | null {
    const wrap = wrapRef.current
    if (!wrap || safeDuration <= 0) return null
    const rect = wrap.getBoundingClientRect()
    const ratio = (clientX - rect.left) / Math.max(1, rect.width)
    return Math.max(0, Math.min(safeDuration, ratio * safeDuration))
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    onSeekActivate?.()
    const time = timeFromClientX(e.clientX)
    if (time == null) return
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, moved: false }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < 6) return
    drag.moved = true
    const time = timeFromClientX(e.clientX)
    if (time == null) return
    onSeek(time)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    const time = timeFromClientX(e.clientX)
    if (time == null) return
    if (drag.moved) {
      onSeek(time)
      return
    }
    if (showLabels) {
      const hit = utteranceAt(time)
      if (hit) {
        onSelect(hit.id, hit.start)
        return
      }
    }
    onSeek(time)
  }

  function selectUtterance(u: Utterance, e?: MouseEvent) {
    e?.stopPropagation()
    onSelect(u.id, u.start)
  }

  return (
    <div className="exhibit">
      <div className="spec-stage">
        <div className="spec-toolbar">
          <h2 className="section-label">频谱与标注</h2>
          {showLabels ? (
            <span className="spec-badge">演示标注 · 非实时模型</span>
          ) : (
            <span className="spec-badge">逐段标签仅在官方示例上提供</span>
          )}
        </div>

        {showLabels && (
          <div className="spec-label-lane" aria-hidden={status !== 'ready'}>
            {UTTERANCES.map((u) => {
              if (safeDuration <= 0) return null
              const left = (u.start / safeDuration) * 100
              const width = ((u.end - u.start) / safeDuration) * 100
              const top = u.expressions.slice(0, 3)
              const isActive = active?.id === u.id
              return (
                <div
                  key={u.id}
                  className={isActive ? 'spec-band-labels is-active' : 'spec-band-labels'}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {top.map((s) => (
                    <button
                      key={s.name_zh}
                      type="button"
                      className="spec-tag"
                      onClick={(e) => selectUtterance(u, e)}
                    >
                      <span>{s.name_zh}</span>
                      <span className="spec-tag-p">{formatProb(s.probability)}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <div className="spec-plot">
          <div className="spec-y" aria-hidden="true">
            {FREQ_TICKS.map((tick) => (
              <span
                key={tick.hz}
                className="spec-y-tick"
                style={{ bottom: `${freqToRatio(tick.hz) * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          <div
            ref={wrapRef}
            className="spec-canvas-wrap"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="slider"
            aria-label="频谱，拖动以定位"
            aria-valuemin={0}
            aria-valuemax={Math.round(safeDuration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={formatClock(currentTime)}
          >
            <canvas ref={canvasRef} />
            {showLabels &&
              safeDuration > 0 &&
              UTTERANCES.map((u) => (
                <div
                  key={u.id}
                  className={active?.id === u.id ? 'spec-band is-active' : 'spec-band'}
                  style={{
                    left: `${(u.start / safeDuration) * 100}%`,
                    width: `${((u.end - u.start) / safeDuration) * 100}%`,
                  }}
                  aria-hidden="true"
                />
              ))}
            {status === 'ready' && (
              <div
                ref={headRef}
                className={reducedMotion ? 'spec-playhead is-static' : 'spec-playhead'}
                style={{ left: `${progress * 100}%` }}
                aria-hidden="true"
              />
            )}
            {status === 'loading' && (
              <div className="spec-status" role="status">
                正在绘制频谱…
              </div>
            )}
            {status === 'error' && (
              <div className="spec-status is-error" role="alert">
                {error ?? '无法绘制这段音频的频谱。'}
              </div>
            )}
          </div>
        </div>

        <div className="spec-x" aria-hidden="true">
          {timeTicks.map((t) => (
            <span
              key={t}
              className="spec-x-tick"
              style={{ left: `${safeDuration > 0 ? (t / safeDuration) * 100 : 0}%` }}
            >
              {formatClock(t)}
            </span>
          ))}
        </div>

        {showLabels && (
          <div className="spec-timeline" role="list">
            {UTTERANCES.map((u, i) => {
              const isActive = active?.id === u.id
              return (
                <button
                  key={u.id}
                  type="button"
                  role="listitem"
                  className={isActive ? 'spec-tl is-active' : 'spec-tl'}
                  onClick={() => onSelect(u.id, u.start)}
                >
                  <span className="spec-tl-time">
                    {formatClock(u.start)} – {formatClock(u.end)}
                  </span>
                  <span className="spec-tl-idx">第 {i + 1} 句</span>
                  <span className="spec-tl-gist">{u.gist}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <ScorePanel utterance={showLabels ? active : null} showHint={!showLabels} playing={playing} />
    </div>
  )
}

function ScorePanel({
  utterance,
  showHint,
  playing,
}: {
  utterance: Utterance | null
  showHint: boolean
  playing: boolean
}) {
  if (showHint) {
    return (
      <aside className="score-panel">
        <h2 className="section-label">当前片段</h2>
        <p className="score-empty">逐段标签仅在官方示例上提供。频谱仍按这段音频的真实采样绘制。</p>
      </aside>
    )
  }

  if (!utterance) {
    return (
      <aside className="score-panel">
        <h2 className="section-label">当前片段</h2>
        <p className="score-empty">点选频谱上的一句，查看演示标注。</p>
      </aside>
    )
  }

  return (
    <aside className="score-panel">
      <h2 className="section-label">当前片段</h2>
      <p className="score-time">
        {formatClock(utterance.start)} – {formatClock(utterance.end)}
        {playing ? <span className="score-live">播放中</span> : null}
      </p>
      <blockquote className="score-quote">
        <p>{utterance.text}</p>
      </blockquote>
      <ScoreGroup title="表情" scores={utterance.expressions} />
      <ScoreGroup title="声音属性" scores={utterance.voice} />
      <p className="score-note">演示标注，不是实时模型调用，也不是医学评估。</p>
    </aside>
  )
}

function ScoreGroup({ title, scores }: { title: string; scores: Utterance['expressions'] }) {
  return (
    <div className="score-group">
      <h3>{title}</h3>
      <ul>
        {scores.map((s) => (
          <li key={s.name_zh}>
            <div className="score-row">
              <span className="score-name">{s.name_zh}</span>
              <span className="score-prob">{formatProb(s.probability)}</span>
            </div>
            <div className="score-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(1, s.probability)) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
