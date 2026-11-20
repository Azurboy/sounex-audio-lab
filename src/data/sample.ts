export type Cue = { start: number; end: number; text: string }
export type Metric = { id: string; label: string; value: string; note?: string }
export type Score = { name_zh: string; name_en?: string; probability: number }
export type Utterance = {
  id: string
  start: number
  end: number
  text: string
  gist: string
  expressions: Score[]
  voice: Score[]
}
export type Answer = {
  id: string
  question: string
  /** short chip label */
  chip: string
  paragraphs: string[]
  /** clickable time ranges cited in the answer, in seconds */
  cues: { start: number; end: number; label: string }[]
  /** metric ids from METRICS that this answer actually used */
  usedMetricIds: string[]
}

export const SAMPLE_AUDIO_SRC = '/audio/sample.mp3'
/** Official cut is 23.719s mp3 / 23.680s PCM; element duration overrides when metadata loads. */
export const SAMPLE_DURATION = 23.72
export const SAMPLE_TITLE = '示例音频'
export const SAMPLE_SUBTITLE = '照护者讲述语言与沟通变化 · 23.7 秒 · 英语实录 · 单声道'

export const UTTERANCES: Utterance[] = [
  {
    id: 'u1',
    start: 0.0,
    end: 3.08,
    text: "It really impacts a person's language and communication.",
    gist: '语言与沟通会受影响',
    expressions: [
      { name_zh: '郑重', probability: 0.62 },
      { name_zh: '关切', probability: 0.48 },
      { name_zh: '专注', probability: 0.41 },
    ],
    voice: [
      { name_zh: '清晰', probability: 0.86 },
      { name_zh: '叙述', probability: 0.72 },
      { name_zh: '克制', probability: 0.64 },
    ],
  },
  {
    id: 'u2',
    start: 3.58,
    end: 10.06,
    text: 'So as the disease progresses, people start to forget words, you know, commonly used words.',
    gist: '会忘掉常用的词',
    expressions: [
      { name_zh: '关切', probability: 0.58 },
      { name_zh: '说明', probability: 0.51 },
      { name_zh: '犹豫', probability: 0.22 },
    ],
    voice: [
      { name_zh: '口语', probability: 0.7 },
      { name_zh: '清晰', probability: 0.8 },
      { name_zh: '填充词', probability: 0.28 },
    ],
  },
  {
    id: 'u3',
    start: 10.82,
    end: 16.66,
    text: 'In my case, for example, my mother was Finnish and she would start mixing up Finnish and English in the same sentence.',
    gist: '母亲会把两种语言混在一句里',
    expressions: [
      { name_zh: '回忆', probability: 0.66 },
      { name_zh: '具体', probability: 0.52 },
      { name_zh: '温和', probability: 0.44 },
    ],
    voice: [
      { name_zh: '亲述', probability: 0.78 },
      { name_zh: '清晰', probability: 0.84 },
      { name_zh: '讲述', probability: 0.7 },
    ],
  },
  {
    id: 'u4',
    start: 17.3,
    end: 23.26,
    text: 'So as it progresses more and more, they really have a hard time putting together sentences.',
    gist: '组句会变得越来越难',
    expressions: [
      { name_zh: '关切', probability: 0.71 },
      { name_zh: '郑重', probability: 0.6 },
      { name_zh: '共情', probability: 0.55 },
    ],
    voice: [
      { name_zh: '清晰', probability: 0.82 },
      { name_zh: '加重', probability: 0.48 },
      { name_zh: '叙述', probability: 0.6 },
    ],
  },
]

export const CUES: Cue[] = UTTERANCES.map((u) => ({
  start: u.start,
  end: u.end,
  text: u.text,
}))

export const DESCRIPTION =
  '这是照护者 Claire Webster 一段英语采访的短摘录，讲的是语言与沟通会如何变化。她先说，这会切实影响一个人的语言和交流；接着提到，随着疾病进展，人们会开始忘掉词，连常用词也一样；她举了自己的例子：母亲是芬兰人，会在同一句话里把芬兰语和英语混在一起；收尾时她说，随着情况一点点发展，他们会很难把句子组织起来。语气是说明性的，带着关切，并不慌乱，也没有生气。这是照护者的第一人称叙述，不是患者在说话，也不是从这段声音得出的医学结论。'

export const METRICS: Metric[] = [
  { id: 'duration', label: '录音时长', value: '23.7 秒' },
  { id: 'speakers', label: '说话人数', value: '1 人', note: '单声道，未做分轨。' },
  { id: 'sentences', label: '句组', value: '4 句组 · 62 词', note: '英语转写。' },
  { id: 'speech', label: '有效说话', value: '15.7 秒' },
  { id: 'pause', label: '停顿', value: '8.0 秒' },
  { id: 'rate', label: '语速', value: '约 157 词/分钟', note: '含停顿。' },
  { id: 'rms', label: '平均电平', value: '−20.9 dBFS', note: '由样例音频直接计算。' },
  { id: 'peak', label: '峰值电平', value: '−1.0 dBFS' },
  { id: 'clip', label: '近满幅采样占比', value: '0%' },
  {
    id: 'f0',
    label: '基频中位',
    value: '190 Hz',
    note: 'p10 168 Hz，p90 226 Hz；对浊音帧自相关测量。',
  },
]

export const ANSWERS: Answer[] = [
  {
    id: 'emotion',
    chip: '这段语音的情绪如何',
    question: '这段语音的情绪如何？',
    paragraphs: [
      '这段声音是说明性的，带着关切，但并不慌乱，也没有生气。分量主要落在开头的 “really impacts a person’s language and communication”、中间关于母亲的具体例子，以及收尾的 “hard time putting together sentences”。说话人是在解释她观察到的变化，语气郑重、克制。',
    ],
    cues: [
      { start: 0.0, end: 3.08, label: 'really impacts language and communication' },
      { start: 10.82, end: 16.66, label: 'mixing up Finnish and English' },
      { start: 17.3, end: 23.26, label: 'hard time putting together sentences' },
    ],
    usedMetricIds: ['sentences', 'f0', 'speech', 'pause'],
  },
  {
    id: 'reply',
    chip: '如果一个AI要回复这个人，该怎么回',
    question: '如果一个 AI 要回复这个人，该怎么回？',
    paragraphs: [
      '要回的是这位照护者，而不是把她当成患者来询问。先承认她讲到的具体观察：随着情况发展，人会忘掉常用词；她的母亲会在同一句话里把芬兰语和英语混在一起；到后来，把句子组织起来会变得很困难。不要下诊断，也不要用空泛的安慰带过这些细节。',
    ],
    cues: [
      { start: 3.58, end: 10.06, label: 'forget commonly used words' },
      { start: 10.82, end: 16.66, label: '母亲会把两种语言混在一句里' },
      { start: 17.3, end: 23.26, label: 'hard time putting together sentences' },
    ],
    usedMetricIds: ['speakers', 'sentences', 'duration'],
  },
  {
    id: 'labels',
    chip: '这段声音里标出了什么',
    question: '这段声音里标出了什么？',
    paragraphs: [
      '频谱上按四句发言做了时间对齐的演示标注，分「表情」和「声音属性」两类，并给出概率。例如第三句偏「回忆」，第四句的「关切」较高；第二句里短暂的 “you know” 对应了较低的「填充词」分数。这些是为这次展示准备的标注，不是实时模型调用，也不是对讲述者或其母亲的医学评估。',
      '标注之下是从这段录音直接算出的声学量：基频中位约 190 Hz，有效说话 15.7 秒、停顿 8.0 秒，平均电平 −20.9 dBFS。',
    ],
    cues: [
      { start: 0.0, end: 3.08, label: '第 1 句 · 郑重 0.62' },
      { start: 3.58, end: 10.06, label: '第 2 句 · 关切 0.58' },
      { start: 10.82, end: 16.66, label: '第 3 句 · 回忆 0.66' },
      { start: 17.3, end: 23.26, label: '第 4 句 · 关切 0.71' },
    ],
    usedMetricIds: ['f0', 'speech', 'pause', 'rms'],
  },
]

/** Map a free-text question to a prepared answer, or null if off-topic. */
export function matchAnswer(q: string): Answer | null {
  const s = q.replace(/\s+/g, '')
  if (!s) return null
  if (/情绪|心情|语气|感受|着急|生气|关切|慌/.test(s)) return ANSWERS[0]
  if (/怎么回|如何回|该怎么|回复|回应|回答他|回答她/.test(s)) return ANSWERS[1]
  if (/标签|频谱|标出|指标|标注|表情|声音属性/.test(s)) return ANSWERS[2]
  return null
}

export const OFFTOPIC =
  '我只能根据这段录音来回答。你可以问这段语音的情绪如何、如果一个 AI 该怎么回，或这段声音里标出了什么。'

export function utteranceAt(time: number, utterances: Utterance[] = UTTERANCES): Utterance | undefined {
  return utterances.find((u) => time >= u.start && time <= u.end)
}

export function formatProb(n: number): string {
  return n.toFixed(2)
}
