export type Metric = { id: string; label: string; value: string; note?: string }
export type AudioCue = { start: number; end: number; label: string }
const reasoningProvider = 'deepseek'

export type AudioMark = { id: string; start: number; end: number; label: string; caption: string; quote?: string }
type Reading = Metric & { group?: string; clip?: [number, number] | null }
type Evidence = { label: string; clip: [number, number] }
type Part = { text: string; evidence?: Evidence[] }
type Report = {
  scene_metrics: Reading[]; product_readings: Reading[]; description_key?: string
  speakers?: { status: string; count: number | null } | null
  events?: { status: string; speech_detected_s?: number | null }
}
type Packet =
  | { type: 'accepted'; queued?: boolean }
  | { type: 'acoustics'; readings: Reading[] }
  | { type: 'metrics'; phase: 'initial' | 'complete'; report: Report }
  | { type: 'transcript'; key?: string; metrics?: Reading[]; metric?: Reading }
  | { type: 'answer'; status: string; reason?: string; provider?: string; parts?: Part[]; turn?: string }
  | { type: 'progress' | 'done' }
  | { type: 'error'; code: string }

export type Measurement = {
  metrics: Metric[]
  marks: AudioMark[]
  key?: string
  transcriptKey?: string
  questionSet?: 'single' | 'sounds'
}

export class MeasurementExpiredError extends Error {}

const principalMetrics = ['duration_s', 'speaker_count', 'speech_detected_s', 'speech', 'pause',
  'pause_total_s', 'sentence_count', 'speech_rate', 'en_wpm', 'f0_hz', 'rms_dbfs', 'peak_dbfs', 'near_clip_pct']

function timeRange(clip: Reading['clip'], duration: number): [number, number] | undefined {
  if (!clip || !Number.isFinite(clip[0]) || !Number.isFinite(clip[1])) return
  const start = Math.max(0, clip[0]), end = Math.min(duration, clip[1])
  if (end > start) return [start, end]
}

function readReport(report: Report, transcript: Reading[], duration: number): Omit<Measurement, 'transcriptKey'> {
  const byId = new Map<string, Reading>()
  // Prefer scene readings where the service also supplies a technical copy.
  for (const row of [...report.product_readings, ...report.scene_metrics, ...transcript]) {
    if (row && typeof row.value === 'string' && row.value.trim()) byId.set(row.id, row)
  }
  const metrics = principalMetrics.flatMap(id => byId.get(id) ?? [])
  const marks: AudioMark[] = []
  const seen = new Set<string>()
  for (const row of [...transcript, ...report.scene_metrics]) {
    const range = timeRange(row?.clip, duration)
    if (!range) continue
    const key = range.join('/')
    if (seen.has(key)) continue
    seen.add(key)
    marks.push({ id: row.id + '/' + key, start: range[0], end: range[1], label: row.label,
      caption: row.id === 'transcript' ? row.value : row.group || '' })
    if (marks.length === 4) break
  }
  const noSpeech = report.events?.status === 'READY' && report.events.speech_detected_s === 0 && !transcript.some(row => row.id === 'transcript')
  const single = report.speakers?.status === 'READY' && report.speakers.count === 1
  return { metrics, marks: marks.sort((a, b) => a.start - b.start), key: report.description_key || undefined,
    questionSet: noSpeech ? 'sounds' : single ? 'single' : undefined }
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response
  const details = await response.json().catch(() => null)
  if (response.status === 429) throw new Error('检测台正忙，请稍后重试。')
  if (response.status === 404 && details?.error?.code === 'MEASUREMENT_EXPIRED') {
    throw new MeasurementExpiredError('测量记录已过期，请重新测量这段录音。')
  }
  throw new Error(details?.error?.message || '暂时连不上声音检测台，请稍后重试。')
}

async function readStream(response: Response, receive: (packet: Packet) => void) {
  await checked(response)
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('声音检测台未返回测量数据，请检查服务连接。')
  }
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let pending = '', finished = false
  try {
    while (!finished) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('与声音检测台的连接已中断，请重试。')
      pending += decoder.decode(chunk.value, { stream: true })
      const frames = pending.split(/\r?\n\r?\n/)
      pending = frames.pop()!
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart())
        if (!data.length) continue
        const packet: Packet = JSON.parse(data.join('\n'))
        if (packet.type === 'error') throw new Error(packet.code === 'BUSY' ? '检测台正忙，请稍后重试。' : '检测服务未能完成这次请求，请重试。')
        if (packet.type === 'done') { finished = true; break }
        receive(packet)
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function measureRecording(pcm: Blob, duration: number, signal: AbortSignal,
  update: (measurement: Measurement, status: string) => void): Promise<Measurement> {
  let report: Report | undefined
  let transcript: Reading[] = [], transcriptKey: string | undefined, complete = false
  let result: Measurement = { metrics: [], marks: [] }
  let body = pcm
  if (pcm.size >= 96 * 1024 && typeof CompressionStream === 'function') {
    try {
      const packed = await new Response(pcm.stream().pipeThrough(new CompressionStream('gzip'))).blob()
      if (packed.size < pcm.size) body = packed.slice(0, packed.size, 'application/gzip')
    } catch { /* Browsers without working gzip support send PCM directly. */ }
  }
  signal.throwIfAborted()
  const response = await fetch('./v1/audio:inspect', { method: 'POST', body, signal })
  await readStream(response, packet => {
    if (packet.type === 'accepted') {
      if (packet.queued) update(result, '录音已收到，正在排队…')
      return
    }
    if (packet.type === 'acoustics') {
      result = readReport({ product_readings: packet.readings, scene_metrics: [] }, [], duration)
      update(result, '正在识别声音…')
      return
    }
    if (packet.type === 'metrics') {
      report = packet.report
      complete = packet.phase === 'complete'
    } else if (packet.type === 'transcript') {
      transcript = packet.metrics ?? (packet.metric ? [packet.metric] : [])
      transcriptKey = packet.key || undefined
    } else return
    if (report) {
      result = { ...readReport(report, transcript, duration), transcriptKey }
      update(result, '正在汇总声音测量…')
    }
  })
  if (!complete || !result.metrics.length) throw new Error('未收到完整的测量结果，请重试。')
  return result
}

function generationError(status: string | undefined, fallback: string): Error {
  const messages: Record<string, string> = {
    MODEL_UNCONFIGURED: 'DeepSeek 尚未配置，请检查服务端配置。',
    MODEL_AUTH_FAILED: 'DeepSeek 凭据无效，请检查服务端配置。',
    MODEL_BALANCE_LOW: 'DeepSeek 账户余额不足，请充值后重试。',
    RATE_LIMITED: '模型请求太频繁，请稍后重试。',
    MODEL_TIMEOUT: '模型响应超时，请重试。',
    MODEL_UNREACHABLE: '暂时连不上模型服务，请重试。',
  }
  return new Error(messages[status ?? ''] ?? fallback)
}

function checkProvider(received?: string) {
  if (received !== reasoningProvider) throw new Error('检测台未接入 DeepSeek，请检查服务连接。')
}

export async function describeRecording(result: Measurement, signal: AbortSignal): Promise<string | undefined> {
  const response = await checked(await fetch('./v1/audio:describe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ key: result.key, transcript_key: result.transcriptKey, format: 'overview', reasoning_provider: reasoningProvider }),
  }))
  const data = await response.json()
  checkProvider(data.provider)
  if (data.status === 'READY' && typeof data.description === 'string' && data.description.trim()) return data.description
  if (data.status === 'NO_SOUND') return '这段录音没有检出可供描述的声音。'
  if (data.status === 'UNSUPPORTED_DESCRIPTION' || data.status === 'INSUFFICIENT_EVIDENCE') return undefined
  throw generationError(data.status, '声音测量已完成，描述暂时无法生成。')
}

export async function askRecording(question: string, result: Measurement, duration: number,
  previous: string | undefined, signal: AbortSignal) {
  const askWithKey = (turn?: string) => fetch('./v1/audio:ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ question, key: result.key, transcript_key: result.transcriptKey, previous_turn: turn, reasoning_provider: reasoningProvider }),
  })
  let response = await askWithKey(previous)
  if (response.status === 409 && previous) response = await askWithKey()
  let turn: string | undefined
  const paragraphs: string[] = [], cues: AudioCue[] = []
  await readStream(response, packet => {
    if (packet.type !== 'answer') return
    checkProvider(packet.provider)
    if (!['READY', 'INSUFFICIENT_EVIDENCE'].includes(packet.status)) throw generationError(packet.reason ?? packet.status, '问答服务暂时不可用，请重试。')
    turn = packet.turn
    for (const part of packet.parts ?? []) {
      if (part.text) paragraphs.push(part.text)
      for (const ref of part.evidence ?? []) {
        const range = timeRange(ref.clip, duration)
        if (range && !cues.some(cue => cue.start === range[0] && cue.end === range[1])) {
          cues.push({ start: range[0], end: range[1], label: ref.label })
        }
      }
    }
  })
  if (!paragraphs.length) throw new Error('未收到录音回答，请重试。')
  return { paragraphs, cues, turn }
}
