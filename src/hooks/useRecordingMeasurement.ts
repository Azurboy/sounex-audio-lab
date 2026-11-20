import { useCallback, useEffect, useRef, useState } from 'react'
import { describeRecording, measureRecording, MeasurementExpiredError, type Measurement } from '../lib/measurement'

type State = Measurement & {
  pcm?: Blob
  phase: 'measuring' | 'describing' | 'ready' | 'measurement-error' | 'description-unavailable'
  message: string
  description?: string
}

const initial: State = { phase: 'measuring', metrics: [], marks: [], message: '正在测量录音…' }

export function useRecordingMeasurement(clip: { pcm: Blob; duration: number } | null) {
  const [state, setState] = useState<State>(initial)
  const [attempt, setAttempt] = useState(0)
  const completed = useRef<{ pcm: Blob; result: Measurement } | null>(null)
  useEffect(() => {
    if (completed.current?.pcm !== clip?.pcm) completed.current = null
    if (!clip) { setState(initial); return }
    const controller = new AbortController(), { signal } = controller
    const { pcm, duration } = clip
    if (!completed.current) setState({ ...initial, pcm })
    async function run() {
      let measured = false
      try {
        const result = completed.current?.result ?? await measureRecording(pcm, duration, signal, (partial, message) => {
          if (!signal.aborted) setState({ ...partial, pcm, phase: 'measuring', message })
        })
        if (signal.aborted) return
        measured = true
        completed.current = { pcm, result }
        setState({ ...result, pcm, phase: 'describing', message: '正在生成音频描述…' })
        if (!result.key) throw new Error('这次测量未返回描述凭据。')
        const description = await describeRecording(result, signal)
        if (!signal.aborted) setState({ ...result, pcm, phase: description ? 'ready' : 'description-unavailable', message: '', description })
      } catch (error) {
        if (signal.aborted) return
        const message = error instanceof Error && !(error instanceof TypeError) ? error.message : '暂时连不上声音检测台，请重试。'
        if (!completed.current?.result.key || error instanceof MeasurementExpiredError) {
          measured = false
          completed.current = null
        }
        setState(prev => ({ ...prev, message, phase: measured ? 'description-unavailable' : 'measurement-error' }))
      }
    }
    void run()
    return () => controller.abort()
  }, [clip, attempt])
  const retry = useCallback((remeasure = false) => {
    if (remeasure) completed.current = null
    setAttempt(n => n + 1)
  }, [])
  return { result: state.pcm === clip?.pcm ? state : initial, retry }
}
