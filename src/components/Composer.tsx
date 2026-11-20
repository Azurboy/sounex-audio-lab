import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { ANSWERS } from '../data/sample'

type Props = {
  disabled?: boolean
  showChips: boolean
  recording: boolean
  recordElapsed: number
  onSubmit: (question: string) => void
  onUpload: () => void
  onRecordStart: () => void
  onRecordStop: () => void
}

export function Composer({
  disabled,
  showChips,
  recording,
  recordElapsed,
  onSubmit,
  onUpload,
  onRecordStart,
  onRecordStop,
}: Props) {
  const [value, setValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [menuOpen])

  function submit(text: string) {
    const q = text.trim()
    if (!q || disabled) return
    onSubmit(q)
    setValue('')
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.focus()
      }
    })
  }

  function onForm(e: FormEvent) {
    e.preventDefault()
    submit(value)
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(value)
    }
  }

  const ready = value.trim().length > 0 && !disabled

  return (
    <div className="dock">
      <div className="shell">
        {recording && (
          <div className="rec-bar" role="status">
            <span className="rec-dot" aria-hidden="true" />
            <span>正在录音</span>
            <span className="rec-time">{formatClock(recordElapsed)}</span>
            <button type="button" className="rec-stop" onClick={onRecordStop}>
              完成
            </button>
          </div>
        )}

        {showChips && !recording && (
          <div className="chips">
            {ANSWERS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="chip"
                onClick={() => submit(a.chip)}
              >
                {a.chip}
              </button>
            ))}
          </div>
        )}

        <form className="composer" onSubmit={onForm}>
          <label className="sr-only" htmlFor="ask">
            问问这段声音
          </label>
          <textarea
            id="ask"
            ref={textareaRef}
            rows={2}
            placeholder="问问这段声音…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            disabled={disabled || recording}
          />
          <div className="composer-bar">
            <div className="attach" ref={menuRef}>
              <button
                type="button"
                className="icon-btn"
                aria-label="上传音频或录音"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((v) => !v)}
                disabled={recording}
              >
                <PlusIcon />
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onUpload()
                    }}
                  >
                    上传音频
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onRecordStart()
                    }}
                  >
                    录音
                  </button>
                </div>
              )}
            </div>
            <button
              type="submit"
              className={ready ? 'send ready' : 'send'}
              aria-label="发送"
              disabled={!ready}
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 3.5v11M3.5 9h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 12.5V3.5M3.8 7.5 8 3.3l4.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
