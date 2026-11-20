import { useCallback, useEffect, useRef, useState } from 'react'
import { audioSession } from './audio/session'
import { clearSpectrogramCache } from './audio/stft'
import { Composer } from './components/Composer'
import { Header } from './components/Header'
import { Metrics } from './components/Metrics'
import { Player } from './components/Player'
import { Spectrogram } from './components/Spectrogram'
import { Thread, type Turn } from './components/Thread'
import {
  DESCRIPTION,
  METRICS,
  OFFTOPIC,
  SAMPLE_AUDIO_SRC,
  SAMPLE_DURATION,
  SAMPLE_SUBTITLE,
  matchAnswer,
  utteranceAt,
} from './data/sample'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'

const MAX_BYTES = 30 * 1024 * 1024
const MAX_SECONDS = 180
const ACCEPT_EXT = new Set(['mp3', 'wav', 'm4a', 'webm', 'ogg', 'oga'])

type SourceKind = 'sample' | 'user'

type UserClip = {
  url: string
  name: string
  duration: number
  kind: 'upload' | 'record'
}

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(SAMPLE_DURATION)
  const [awaitingGesture, setAwaitingGesture] = useState(false)
  const [source, setSource] = useState<SourceKind>('sample')
  const [userClip, setUserClip] = useState<UserClip | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [clipTurns, setClipTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordElapsed, setRecordElapsed] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>('u1')

  const awaitingRef = useRef(false)
  const sourceRef = useRef<SourceKind>('sample')
  const userUrlRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<number | null>(null)
  const recStartedAtRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const dragDepth = useRef(0)
  const askId = useRef(0)

  sourceRef.current = source
  awaitingRef.current = awaitingGesture

  const syncDuration = useCallback(() => {
    const d = audioSession.element.duration
    if (Number.isFinite(d) && d > 0) setDuration(d)
    else if (sourceRef.current === 'sample') setDuration(SAMPLE_DURATION)
  }, [])

  useEffect(() => {
    const el = audioSession.element
    document.body.appendChild(el)

    const onTime = () => setCurrentTime(el.currentTime)
    const onDur = () => syncDuration()
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => {
      setPlaying(false)
      setCurrentTime(el.duration || el.currentTime)
    }

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('durationchange', onDur)
    el.addEventListener('loadedmetadata', onDur)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnd)

    setPlaying(!el.paused)
    setCurrentTime(el.currentTime || 0)
    syncDuration()

    let cancelled = false
    ;(async () => {
      try {
        await audioSession.ensureGraph()
        if (el.paused) await audioSession.play()
        if (!cancelled) {
          setAwaitingGesture(false)
          awaitingRef.current = false
        }
      } catch {
        if (!cancelled) {
          setAwaitingGesture(true)
          awaitingRef.current = true
        }
      }
    })()

    return () => {
      cancelled = true
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('durationchange', onDur)
      el.removeEventListener('loadedmetadata', onDur)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnd)
    }
  }, [syncDuration])

  const play = useCallback(async () => {
    try {
      await audioSession.ensureGraph()
      await audioSession.play()
      setAwaitingGesture(false)
      awaitingRef.current = false
      setNotice(null)
    } catch {
      setAwaitingGesture(true)
      awaitingRef.current = true
    }
  }, [])

  const pause = useCallback(() => {
    audioSession.pause()
  }, [])

  const toggle = useCallback(() => {
    if (audioSession.element.paused) void play()
    else pause()
  }, [play, pause])

  const seek = useCallback((time: number) => {
    audioSession.seek(time)
    setCurrentTime(time)
  }, [])

  const seekAndPlay = useCallback(
    (time: number) => {
      audioSession.seek(time)
      setCurrentTime(time)
      void play()
    },
    [play],
  )

  const unlockIfNeeded = useCallback(() => {
    if (awaitingRef.current) void play()
  }, [play])

  const selectUtterance = useCallback(
    (id: string, start: number) => {
      setSelectedId(id)
      if (awaitingRef.current) {
        audioSession.seek(start)
        setCurrentTime(start)
        void play()
        return
      }
      seek(start)
    },
    [play, seek],
  )

  useEffect(() => {
    if (source !== 'sample') return
    const hit = utteranceAt(currentTime)
    if (hit) setSelectedId(hit.id)
  }, [currentTime, source])

  function revokeUserUrl() {
    if (userUrlRef.current) {
      clearSpectrogramCache(userUrlRef.current)
      URL.revokeObjectURL(userUrlRef.current)
      userUrlRef.current = null
    }
  }

  const loadUserClip = useCallback(
    async (file: Blob, name: string, kind: 'upload' | 'record') => {
      if (file.size > MAX_BYTES) {
        setNotice('文件不能超过 30 MB。')
        return
      }
      const url = URL.createObjectURL(file)
      const dur = await readDuration(url)
      if (Number.isFinite(dur) && dur > MAX_SECONDS) {
        URL.revokeObjectURL(url)
        setNotice('音频请控制在 3 分钟以内。')
        return
      }
      revokeUserUrl()
      userUrlRef.current = url
      audioSession.setSrc(url)
      setUserClip({ url, name, duration: Number.isFinite(dur) && dur > 0 ? dur : 0, kind })
      setSource('user')
      setDuration(Number.isFinite(dur) && dur > 0 ? dur : 0)
      setCurrentTime(0)
      setPlaying(false)
      setAwaitingGesture(false)
      awaitingRef.current = false
      setNotice(null)
      setClipTurns([])
      setSelectedId(null)
    },
    [],
  )

  const restoreSample = useCallback(() => {
    audioSession.setSrc(SAMPLE_AUDIO_SRC)
    setSource('sample')
    setDuration(SAMPLE_DURATION)
    setCurrentTime(0)
    setPlaying(false)
    setNotice(null)
    setClipTurns([])
    setSelectedId('u1')
  }, [])

  const onFileChosen = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!isAudioFile(file)) {
        setNotice('请上传 wav、mp3、m4a、webm 或 ogg 音频。')
        return
      }
      void loadUserClip(file, file.name, 'upload')
    },
    [loadUserClip],
  )

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e) && dragDepth.current === 0) return
      e.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      onFileChosen(file)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onFileChosen])

  useEffect(() => {
    return () => {
      revokeUserUrl()
      stopRecInternal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRecording = useCallback(async () => {
    setNotice(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('当前浏览器不支持录音。')
      return
    }
    try {
      pause()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        if (blob.size > 0) {
          void loadUserClip(blob, `录音.${ext}`, 'record')
        }
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      recorderRef.current = rec
      rec.start()
      recStartedAtRef.current = performance.now()
      setRecordElapsed(0)
      setRecording(true)
      recTimerRef.current = window.setInterval(() => {
        const elapsed = (performance.now() - recStartedAtRef.current) / 1000
        setRecordElapsed(elapsed)
        if (elapsed >= MAX_SECONDS) {
          stopRecInternal()
          setRecording(false)
        }
      }, 200)
    } catch {
      setNotice('无法使用麦克风，请检查权限。')
    }
  }, [loadUserClip, pause])

  const stopRecording = useCallback(() => {
    stopRecInternal()
    setRecording(false)
  }, [])

  function stopRecInternal() {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current)
      recTimerRef.current = null
    }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const onAsk = useCallback(
    async (question: string) => {
      const onSample = sourceRef.current === 'sample'
      const qid = `q-${++askId.current}`
      const aid = `a-${askId.current}`
      const setActive = onSample ? setTurns : setClipTurns
      const sendGap = reducedMotion ? 0 : 380
      const listenMs = reducedMotion ? 160 : 1400

      setBusy(true)
      setActive((prev) => [...prev, { id: qid, role: 'user', text: question }])
      await wait(sendGap)

      setActive((prev) => [
        ...prev,
        { id: aid, role: 'assistant', thinking: true, paragraphs: [], cues: [] },
      ])
      await wait(listenMs)

      if (!onSample) {
        setActive((prev) =>
          prev.map((t) =>
            t.id === aid && t.role === 'assistant'
              ? {
                  id: aid,
                  role: 'assistant',
                  paragraphs: [
                    '这段原型的完整描述和根据指标给出的回答，是为官方示例音频准备的。你可以继续播放自己的音频，或切回示例音频。',
                  ],
                  cues: [],
                }
              : t,
          ),
        )
        setBusy(false)
        return
      }

      const answer = matchAnswer(question)
      const usedMetrics = answer
        ? METRICS.filter((m) => answer.usedMetricIds.includes(m.id))
        : []
      setActive((prev) =>
        prev.map((t) =>
          t.id === aid && t.role === 'assistant'
            ? {
                id: aid,
                role: 'assistant',
                paragraphs: answer ? answer.paragraphs : [OFFTOPIC],
                cues: answer ? answer.cues : [],
                usedMetrics,
              }
            : t,
        ),
      )
      setBusy(false)
    },
    [reducedMotion],
  )

  useEffect(() => {
    const thread = document.querySelector('.thread')
    if (!thread) return
    const last = thread.lastElementChild
    last?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'end' })
  }, [turns, clipTurns, source, reducedMotion])

  const isSample = source === 'sample'
  const label = isSample
    ? SAMPLE_SUBTITLE
    : `${userClip?.name ?? '音频'} · ${formatDurationLabel(userClip?.duration ?? duration)}`
  const activeTurns = isSample ? turns : clipTurns
  const audioSrc = isSample ? SAMPLE_AUDIO_SRC : (userClip?.url ?? SAMPLE_AUDIO_SRC)

  return (
    <div className="app" id="top">
      <Header />
      <main className="main">
        <section className="hero shell-wide" onPointerDown={unlockIfNeeded}>
          <div className="hero-copy shell">
            <h1>LLM 理解了文字，但声音呢？</h1>
            <p className="hero-sub">
              模型不只记下说了什么，也会听它是怎么说的。你可以直接问这段声音。
            </p>
          </div>
          <Spectrogram
            src={audioSrc}
            currentTime={currentTime}
            duration={isSample ? duration || SAMPLE_DURATION : duration}
            playing={playing}
            showLabels={isSample}
            reducedMotion={reducedMotion}
            selectedId={isSample ? selectedId : null}
            onSelect={selectUtterance}
            onSeek={seek}
            onSeekActivate={unlockIfNeeded}
          />
          <div className="shell">
            <Player
              playing={playing}
              currentTime={currentTime}
              duration={isSample ? duration || SAMPLE_DURATION : duration}
              label={label}
              onToggle={toggle}
              onSeek={seek}
              onScrubActivate={unlockIfNeeded}
            />
            {!isSample && (
              <button type="button" className="back-link" onClick={restoreSample}>
                切回示例音频
              </button>
            )}
          </div>
        </section>

        {isSample && (
          <div className="shell-wide">
            <Metrics />
          </div>
        )}

        <section className="section shell">
          <h2 className="section-label">音频描述</h2>
          {isSample ? (
            <p className="description">{DESCRIPTION}</p>
          ) : (
            <div className="user-note">
              <p>
                这段原型的完整描述和根据指标给出的回答，是为官方示例音频准备的。你可以继续播放自己的音频，或切回示例音频。
              </p>
            </div>
          )}
          {notice && <p className="notice">{notice}</p>}
        </section>

        <div className="shell">
          <Thread turns={activeTurns} onSeekCue={seekAndPlay} reducedMotion={reducedMotion} />
        </div>

        <footer className="site-foot shell">
          <p>
            示例音频摘自 Psych2Go 采访，讲述者 Claire Webster，采访者 Monica Taing，McGill
            Dementia Education Program，CC BY 3.0。
          </p>
          <p>不要从声音诊断疾病。出声的是照护者，不是患者。</p>
        </footer>
      </main>

      <Composer
        disabled={busy}
        showChips={isSample && !busy}
        recording={recording}
        recordElapsed={recordElapsed}
        onSubmit={onAsk}
        onUpload={() => fileRef.current?.click()}
        onRecordStart={() => void startRecording()}
        onRecordStop={stopRecording}
      />

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
        onChange={(e) => {
          onFileChosen(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {dragging && (
        <div className="drop-overlay" role="status">
          <span>松开以使用这段音频</span>
        </div>
      )}
    </div>
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes('Files')
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ACCEPT_EXT.has(ext)
}

function pickMime(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  if (typeof MediaRecorder === 'undefined') return undefined
  return candidates.find((c) => MediaRecorder.isTypeSupported(c))
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('audio')
    el.preload = 'metadata'
    const done = (value: number) => {
      el.removeAttribute('src')
      el.load()
      resolve(value)
    }
    el.onloadedmetadata = () => {
      const d = el.duration
      done(Number.isFinite(d) && d > 0 ? d : 0)
    }
    el.onerror = () => done(0)
    el.src = url
  })
}

function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '已载入'
  if (seconds < 60) return `${seconds.toFixed(1).replace(/\.0$/, '')} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m} 分 ${s} 秒`
}
