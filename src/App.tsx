import { useCallback, useEffect, useRef, useState } from 'react'
import { audioSession } from './audio/session'
import { decodeMono, encodePcm, MAX_SECONDS, playbackWav, SAMPLE_RATE } from './audio/pcm'
import { AudioEntry } from './components/AudioEntry'
import { Composer, type MicState } from './components/Composer'
import { Header } from './components/Header'
import { Metrics } from './components/Metrics'
import { Player } from './components/Player'
import { Spectrogram } from './components/Spectrogram'
import { Thread, type Turn } from './components/Thread'
import { SAMPLE_AUDIO_SRC, SAMPLE_TITLE, SAMPLE_CREDIT_URL } from './data/sample'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useRecordingMeasurement } from './hooks/useRecordingMeasurement'
import { askRecording, MeasurementExpiredError } from './lib/measurement'

const MAX_BYTES = 30 * 1024 * 1024
type ClipSource = 'recording' | 'upload' | 'sample'
type UserClip = { url: string; name: string; duration: number; samples: Float32Array; pcm: Blob; source: ClipSource }
const changeQuestion = '哪一刻语气或节奏变了？带我回听那几秒。'
const questions = {
  conversation: ['有几个人在说话？听起来像在争论，还是在商量？', '谁在推动话题？哪句话让你这么判断？', changeQuestion],
  single: ['这个人最想让听众记住什么？哪句话最能说明？', '说到哪里停得最久？停下来之后说了什么？', changeQuestion],
  sounds: ['最先听到的声音和结尾一样吗？', '哪种声音反复出现？帮我找到相邻的两次。', '只回听几秒，哪一段最能听出声音的变化？'],
}

async function sampleFile(): Promise<Blob> {
  const response = await fetch(SAMPLE_AUDIO_SRC)
  if (!response.ok) throw new Error('无法读取示例音频。')
  return response.blob()
}

type Capture = { stream?: MediaStream; recorder?: MediaRecorder; timer?: number }

function releaseMic(job: Capture) {
  window.clearInterval(job.timer)
  job.stream?.getTracks().forEach(track => track.stop())
}

export default function App({ siteNavigation = false }: { siteNavigation?: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const [clip, setClip] = useState<UserClip | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [choosing, setChoosing] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [mic, setMic] = useState<MicState>('idle')
  const [recordElapsed, setRecordElapsed] = useState(0)
  const { result, retry } = useRecordingMeasurement(clip)

  const fileInput = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const liveUrl = useRef<string | null>(null)
  const capture = useRef<Capture | null>(null)
  const askJob = useRef<AbortController | null>(null)
  const lastAnswer = useRef<string | undefined>(undefined)
  const queuedQuestion = useRef<{ text: string; pcm: Blob } | null>(null)
  const cueEnd = useRef<number | null>(null)
  const dragDepth = useRef(0)
  const scrollArea = useRef<HTMLElement>(null)
  const following = useRef(true)
  const inEntry = !clip || choosing
  const canAsk = Boolean(clip && result.key && result.phase !== 'measuring' && result.phase !== 'measurement-error')

  const discardCapture = useCallback(() => {
    const job = capture.current
    if (!job) return
    capture.current = null
    if (job.recorder && job.recorder.state !== 'inactive') job.recorder.stop()
    releaseMic(job)
  }, [])

  useEffect(() => {
    const el = audioSession.element
    document.body.appendChild(el)
    function syncTime() {
      if (cueEnd.current !== null && el.currentTime >= cueEnd.current) {
        const end = cueEnd.current
        cueEnd.current = null
        el.pause()
        el.currentTime = end
      }
      setCurrentTime(Number.isFinite(el.currentTime) ? el.currentTime : 0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('timeupdate', syncTime)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onPause)
    return () => {
      generation.current++
      askJob.current?.abort()
      discardCapture()
      el.removeEventListener('timeupdate', syncTime)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onPause)
      el.pause()
      el.remove()
      if (liveUrl.current) URL.revokeObjectURL(liveUrl.current)
      liveUrl.current = null
    }
  }, [discardCapture])

  useEffect(() => {
    const area = scrollArea.current
    if (inEntry || !area || !turns.length || !following.current) return
    area.scrollTop = area.scrollHeight
  }, [turns, inEntry])

  useEffect(() => {
    if (inEntry || !scrollArea.current) return
    scrollArea.current.focus({ preventScroll: true })
  }, [clip, inEntry])

  useEffect(() => {
    const viewport = window.visualViewport
    const workspace = scrollArea.current?.parentElement
    if (inEntry || !viewport || !workspace) return
    // Some mobile keyboards resize only the visual viewport. Leave pinch zoom to the browser.
    function fitViewport() {
      if (viewport?.scale === 1) workspace?.style.setProperty('--workspace-height', viewport.height + 'px')
    }
    fitViewport()
    viewport.addEventListener('resize', fitViewport)
    return () => {
      viewport.removeEventListener('resize', fitViewport)
      workspace.style.removeProperty('--workspace-height')
    }
  }, [inEntry])

  useEffect(() => {
    if (!siteNavigation) return
    function leaveLab() {
      if (!/^#(metrics|api)(?:\/|$)/.test(location.hash)) return
      discardCapture()
      setMic('idle')
      audioSession.pause()
    }
    window.addEventListener('hashchange', leaveLab)
    return () => window.removeEventListener('hashchange', leaveLab)
  }, [siteNavigation, discardCapture])

  function play() {
    void audioSession.play().catch(() => setNotice('暂时无法播放，请再点一次播放。'))
  }

  function seek(time: number) {
    cueEnd.current = null
    audioSession.seek(time)
    setCurrentTime(time)
  }

  function listen(start: number, end: number) {
    seek(start)
    cueEnd.current = end
    play()
  }

  const switchClip = useCallback((next: UserClip) => {
    askJob.current?.abort()
    askJob.current = null
    lastAnswer.current = undefined
    cueEnd.current = null
    const oldUrl = liveUrl.current
    liveUrl.current = next.url
    audioSession.setSrc(next.url)
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    setClip(next)
    setTurns([])
    queuedQuestion.current = null
    following.current = true
    if (scrollArea.current) scrollArea.current.scrollTop = 0
    setChoosing(false)
    setCurrentTime(0)
    setPlaying(false)
    setBusy(false)
    setNotice(null)
  }, [])

  const loadClip = useCallback(async (input: Blob | Promise<Blob>, name: string, source: ClipSource) => {
    const id = ++generation.current
    setNotice(null)
    setReading(true)
    try {
      const file = await input
      if (id !== generation.current) return
      if (!file.size || file.size > MAX_BYTES) {
        setNotice(file.size ? '文件不能超过 30 MB。' : '音频是空的，请再试一次。')
        return
      }
      const decoded = await decodeMono(file)
      if (id !== generation.current) return
      const maxSamples = MAX_SECONDS * SAMPLE_RATE
      if (source !== 'recording' && decoded.length > maxSamples) {
        setNotice('请选择 3 分钟以内的音频。')
        return
      }
      const samples = decoded.subarray(0, maxSamples)
      if (samples.length < 0.03 * SAMPLE_RATE) {
        setNotice('音频太短，请再录一段或选择其他文件。')
        return
      }
      const pcm = encodePcm(samples)
      const url = URL.createObjectURL(source === 'recording' ? playbackWav(pcm) : file)
      switchClip({ url, name, samples, pcm, duration: samples.length / SAMPLE_RATE, source })
    } catch {
      if (id === generation.current) setNotice('这段音频无法读取，请重试或选择其他文件。')
    } finally {
      if (id === generation.current) setReading(false)
    }
  }, [switchClip])

  const onFileChosen = useCallback((file?: File) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|webm|ogg|oga)$/i.test(file.name)) {
      generation.current++
      setReading(false)
      setNotice('请上传 wav、mp3、m4a、webm 或 ogg 音频。')
      return
    }
    discardCapture()
    setMic('idle')
    void loadClip(file, file.name, 'upload')
  }, [discardCapture, loadClip])

  function cancelRecording() {
    discardCapture()
    setMic('idle')
    setNotice(null)
  }

  function finishRecording() {
    const recorder = capture.current?.recorder
    if (recorder?.state === 'recording') recorder.stop()
  }

  function chooseAudio() {
    if (inEntry) return
    generation.current++
    queuedQuestion.current = null
    cancelRecording()
    audioSession.pause()
    setReading(false)
    setChoosing(true)
  }

  function cancelEntry() {
    generation.current++
    queuedQuestion.current = null
    cancelRecording()
    setReading(false)
    setChoosing(false)
  }

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !document.getElementById('root')?.hidden && Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (e: DragEvent) => {
      if (hasFiles(e)) { e.preventDefault(); dragDepth.current++; setDragging(true) }
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
    }
    const onLeave = (e: DragEvent) => {
      if (dragDepth.current) { e.preventDefault(); if (--dragDepth.current === 0) setDragging(false) }
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      onFileChosen(e.dataTransfer?.files[0])
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

  async function startRecording() {
    if (capture.current) return
    audioSession.pause()
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('这个浏览器无法录音。可在系统浏览器打开本页，或上传音频。')
      return
    }
    const job: Capture = {}
    capture.current = job
    generation.current++
    setReading(false)
    setMic('requesting')
    setNotice(null)
    try {
      job.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (capture.current !== job) { releaseMic(job); return }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      const rec = new MediaRecorder(job.stream, mimeType ? { mimeType } : undefined)
      job.recorder = rec
      const chunks: Blob[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        releaseMic(job)
        if (capture.current !== job) return
        capture.current = null
        setMic('idle')
        void loadClip(new Blob(chunks, { type: rec.mimeType }), '我的录音', 'recording')
      }
      rec.onerror = () => {
        if (capture.current !== job) return
        discardCapture()
        setMic('idle')
        setNotice('录音已中断，请重新录音。')
      }
      audioSession.pause()
      rec.start()
      const start = performance.now()
      setRecordElapsed(0)
      setMic('recording')
      setNotice(null)
      job.timer = window.setInterval(() => {
        const elapsed = (performance.now() - start) / 1000
        setRecordElapsed(elapsed)
        if (elapsed >= MAX_SECONDS && rec.state === 'recording') rec.stop()
      }, 200)
    } catch {
      releaseMic(job)
      if (capture.current !== job) return
      capture.current = null
      setMic('idle')
      setNotice('无法打开麦克风，请允许浏览器使用麦克风，或上传音频。')
    }
  }

  const onAsk = useCallback(async (question: string, retryAnswerId?: string) => {
    if (!clip || inEntry || askJob.current || capture.current || !canAsk || reading) return
    queuedQuestion.current = null
    setNotice(null)
    const job = new AbortController()
    askJob.current = job
    following.current = true
    setBusy(true)
    const id = crypto.randomUUID()
    const pending: Turn = { id: retryAnswerId ?? id + '-a', role: 'assistant', thinking: true, paragraphs: [], cues: [] }
    setTurns(prev => retryAnswerId
      ? prev.map(turn => turn.id === retryAnswerId ? pending : turn)
      : [...prev, { id, role: 'user', text: question }, pending])
    let reply: Turn
    try {
      const answer = await askRecording(question, result, clip.duration, lastAnswer.current, job.signal)
      if (job.signal.aborted) return
      lastAnswer.current = answer.turn
      reply = { id: pending.id, role: 'assistant', paragraphs: answer.paragraphs, cues: answer.cues }
    } catch (error) {
      if (job.signal.aborted) return
      let text = error instanceof Error && !(error instanceof TypeError) ? error.message : '暂时连不上问答服务，请重试。'
      if (error instanceof MeasurementExpiredError) {
        lastAnswer.current = undefined
        retry(true)
        text = '正在重新测量录音，完成后可以重试这条提问。'
      }
      reply = { id: pending.id, role: 'assistant', paragraphs: [text], cues: [], retryQuestion: question }
    } finally {
      if (askJob.current === job) { askJob.current = null; setBusy(false) }
    }
    setTurns(prev => prev.map(turn => turn.id === pending.id ? reply : turn))
  }, [clip, inEntry, canAsk, reading, result, retry])

  useEffect(() => {
    const queued = queuedQuestion.current
    if (!queued || queued.pcm !== clip?.pcm || inEntry || !canAsk || reading || busy || mic !== 'idle') return
    queuedQuestion.current = null
    setDraft('')
    void onAsk(queued.text)
  }, [clip, inEntry, canAsk, reading, busy, mic, onAsk])

  function submitDraft(question: string) {
    if (!clip || choosing || askJob.current || capture.current || reading) return
    if (!canAsk) {
      queuedQuestion.current = { text: question, pcm: clip.pcm }
      setNotice('测量完成后会发送这个问题。')
      return
    }
    setDraft('')
    void onAsk(question)
  }

  function updateDraft(value: string) {
    if (queuedQuestion.current) {
      queuedQuestion.current = null
      setNotice(null)
    }
    setDraft(value)
  }

  const openFile = () => fileInput.current?.click()
  const measuredFacts = result.phase === 'description-unavailable'
    ? result.metrics.filter(metric => ['duration_s', 'speech_detected_s', 'pause'].includes(metric.id))
      .map(metric => metric.label + ' ' + metric.value).join('，')
    : ''
  const headerAction = !clip ? undefined : inEntry
    ? { label: '返回对话', onClick: cancelEntry }
    : { label: '更换音频', onClick: chooseAudio }
  const composer = (
    <Composer value={draft} onChange={updateDraft} onSubmit={submitDraft} needsAudio={inEntry}
      disabled={!inEntry && (busy || result.phase === 'measurement-error')}
      mic={mic} elapsed={recordElapsed} reading={reading} notice={notice}
      onUpload={openFile} onRecord={() => void startRecording()} onFinish={finishRecording} onCancel={cancelRecording} />
  )

  return (
    <div className={inEntry ? 'app entry-page' : 'app workspace'} id="top">
      <Header siteNavigation={siteNavigation} onHome={chooseAudio} action={headerAction} />
      {!clip || choosing ? (
        <AudioEntry onSample={mic === 'idle' && !reading ? () => void loadClip(sampleFile(), SAMPLE_TITLE, 'sample') : undefined}>
          {composer}
        </AudioEntry>
      ) : (
        <>
          <main className="workspace-scroll" ref={scrollArea} tabIndex={-1} aria-label="音频与对话"
            onScroll={event => {
              const area = event.currentTarget
              following.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80
            }}>
            <div className="workspace-content shell">
              <section className="audio-sheet" aria-label="音频与测量结果">
                <Player label={clip.name} playing={playing} currentTime={currentTime} duration={clip.duration} onSeek={seek}
                  onToggle={() => { if (playing) audioSession.pause(); else { cueEnd.current = null; play() } }} />
                <Spectrogram key={clip.url} src={clip.url} samples={clip.samples} currentTime={currentTime}
                  duration={clip.duration} playing={playing} reducedMotion={reducedMotion} onSeek={seek} />
                <Metrics key={'metrics-' + clip.url} metrics={result.metrics} marks={result.marks} onListen={listen} />
                {clip.source === 'sample' && <p className="sample-credit">
                  Psych2Go · CC BY 3.0 <a href={SAMPLE_CREDIT_URL} target="_blank" rel="noreferrer">音频来源</a>
                </p>}
              </section>

              <Thread turns={turns} onSeekCue={listen} onRetry={onAsk} introduction={result.description
                ? <p className="description">{result.description}</p>
                : <div className="measurement-status">
                    {measuredFacts && <p>本次测得{measuredFacts}。</p>}
                    {result.message && <p>{result.message}</p>}
                    {(result.phase === 'measurement-error' || result.phase === 'description-unavailable') && (
                      <button type="button" className="text-button" onClick={() => {
                        if (result.phase === 'measurement-error') lastAnswer.current = undefined
                        retry()
                      }}>{result.phase === 'description-unavailable' ? '重新生成描述' : '重新测量'}</button>
                    )}
                  </div>} />
              {canAsk && mic === 'idle' && !turns.length && <div className="chips" role="group" aria-label="可以这样问">
                {questions[result.questionSet ?? 'conversation'].map(question => <button type="button" className="chip" key={question} onClick={() => void onAsk(question)}>{question}</button>)}
              </div>}
            </div>
          </main>
          <footer className="dock"><div className="shell">{composer}</div></footer>
        </>
      )}
      <input ref={fileInput} hidden type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.oga" aria-label="上传音频文件"
        onChange={event => { onFileChosen(event.target.files?.[0]); event.target.value = '' }} />
      {dragging && <div className="drop-overlay" role="status"><span>松开以测量这段音频</span></div>}
    </div>
  )
}
