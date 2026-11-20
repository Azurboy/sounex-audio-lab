import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { formatClock } from '../lib/time'

export type MicState = 'idle' | 'requesting' | 'recording'

type Props = {
  value: string
  onChange: (value: string) => void
  needsAudio: boolean
  disabled: boolean
  reading: boolean
  mic: MicState
  elapsed: number
  notice: string | null
  onSubmit: (question: string) => void
  onUpload: () => void
  onRecord: () => void
  onFinish: () => void
  onCancel: () => void
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

export function Composer({ value, onChange, needsAudio, disabled, reading, mic, elapsed, notice, onSubmit, onUpload, onRecord, onFinish, onCancel }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const recordButton = useRef<HTMLButtonElement>(null)
  const recording = mic === 'recording'
  const ready = !needsAudio && !disabled && !reading && mic === 'idle' && Boolean(value.trim())
  const micLabel = recording ? '完成录音' : needsAudio ? '说点什么' : '开始录音'

  useEffect(() => {
    const field = textarea.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = Math.min(field.scrollHeight, 160) + 'px'
  }, [value])

  function submit(event: FormEvent | KeyboardEvent) {
    event.preventDefault()
    if (needsAudio) recordButton.current?.focus()
    else if (ready) onSubmit(value.trim())
  }

  const send = <button type="submit" className={ready ? 'send ready' : 'send'} aria-label="发送"
    title={needsAudio ? '请先添加音频' : '发送'} disabled={!ready}>
    <Icon><path strokeWidth="2" d="M12 19V5m-6 6 6-6 6 6" /></Icon>
  </button>

  const record = mic !== 'requesting' && (
    <button type="button" ref={recordButton} className={(needsAudio ? 'audio-record' : 'icon-btn') + (recording ? ' recording-stop' : '')}
      aria-label={micLabel} title={recording ? '完成录音' : '开始录音'} disabled={reading} onClick={recording ? onFinish : onRecord}>
      {recording ? <Icon><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" /></Icon>
        : <Icon><rect x="8.5" y="2.8" width="7" height="12" rx="3.5" /><path d="M5 10.8a7 7 0 0 0 14 0M12 17.8v3.4m-3.2 0h6.4" /></Icon>}
      {needsAudio && (recording ? '完成录音' : '说点什么')}
    </button>
  )
  const upload = (
    <button type="button" className={needsAudio ? 'audio-upload' : 'icon-btn'} title="上传音频" aria-label="上传音频" onClick={onUpload} disabled={reading}>
      <Icon>{needsAudio
        ? <path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5M4 15v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V15" />
        : <path d="m20.8 11.2-8.5 8.5a5.6 5.6 0 0 1-7.9-7.9l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.4 8.4a1.85 1.85 0 0 1-2.6-2.6l7.7-7.7" />}</Icon>
      {needsAudio && '上传音频'}
    </button>
  )
  const audioControls = (
    <div className={needsAudio ? 'voice-actions' : 'composer-bar'} role="group" aria-label="录音或上传音频">
      {mic === 'idle' ? needsAudio ? <>{record}{upload}</> : <>{upload}<div className="composer-actions">{record}{send}</div></> : <>
        <div className="capture-line">
          {recording ? <>
            <i className="rec-dot" aria-hidden="true" />
            <span className="sr-only" role="status">正在录音</span>
            <time role="timer" aria-label="录音时长">{formatClock(elapsed)}</time>
          </> : <span role="status">正在打开麦克风…</span>}
        </div>
        {record}
        <button type="button" className="icon-btn" title="取消录音" aria-label="取消录音" onClick={onCancel}>
          <Icon><path d="m7 7 10 10M17 7 7 17" /></Icon>
        </button>
      </>}
    </div>
  )

  return (
    <>
      <form className="composer" aria-label="音频问答" onSubmit={submit}>
        {needsAudio && audioControls}
        <div className="question-field">
          <label className="sr-only" htmlFor="ask">关于这段声音的问题</label>
          <textarea id="ask" ref={textarea} rows={1} maxLength={240} enterKeyHint={needsAudio ? 'done' : 'send'}
            placeholder="输入文字，问问这段声音…" value={value} onChange={event => onChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) submit(event)
            }} />
          {needsAudio && send}
        </div>
        {!needsAudio && audioControls}
      </form>
      {(reading || notice) && <p className="notice" role="status">{reading ? '正在读取音频…' : notice}</p>}
    </>
  )
}
