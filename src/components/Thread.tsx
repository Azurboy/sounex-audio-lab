import brandMark from '/brand/mark.svg?url'
import type { ReactNode } from 'react'
import type { AudioCue } from '../lib/measurement'
import { AudioCues } from './AudioCues'

export type Turn =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; thinking?: boolean; retryQuestion?: string; paragraphs: string[]; cues: AudioCue[] }

type Props = {
  introduction: ReactNode
  turns: Turn[]
  onSeekCue: (start: number, end: number) => void
  onRetry: (question: string, answerId: string) => void
}

function AssistantMessage({ children }: { children: ReactNode }) {
  return (
    <div className="turn-assistant" role="group" aria-label="Sounex 回复">
      <img className="assistant-mark" src={brandMark} width="26" height="26" alt="" />
      <div className="reply-body">{children}</div>
    </div>
  )
}

export function Thread({ introduction, turns, onSeekCue, onRetry }: Props) {
  return (
    <div className="thread" role="log" aria-label="音频对话" aria-live="polite" aria-relevant="additions text">
      <AssistantMessage>{introduction}</AssistantMessage>
      {turns.map((turn, i) => turn.role === 'user'
        ? <div className="turn-user" role="group" aria-label="你的提问" key={turn.id}>{turn.text}</div>
        : <AssistantMessage key={turn.id}>
            {turn.thinking
              ? <p className="thinking">正在听这段声音…</p>
              : <>
                  {turn.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                  <AudioCues cues={turn.cues} onListen={onSeekCue} />
                  {turn.retryQuestion && i === turns.length - 1 &&
                    <button type="button" className="text-button" onClick={() => onRetry(turn.retryQuestion!, turn.id)}>重试回答</button>}
                </>}
          </AssistantMessage>)}
    </div>
  )
}
