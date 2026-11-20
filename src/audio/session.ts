import { SAMPLE_AUDIO_SRC } from '../data/sample'

export type Listener = () => void

function createElement(): HTMLAudioElement {
  const el = document.createElement('audio')
  el.preload = 'auto'
  el.setAttribute('playsinline', '')
  el.controls = false
  el.crossOrigin = 'anonymous'
  el.setAttribute('hidden', '')
  el.src = SAMPLE_AUDIO_SRC
  return el
}

class AudioSession {
  readonly element: HTMLAudioElement
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null

  constructor() {
    this.element = createElement()
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  async ensureGraph(): Promise<AnalyserNode> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (!this.source) {
      this.source = this.ctx.createMediaElementSource(this.element)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.7
      this.source.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    return this.analyser!
  }

  async play(): Promise<void> {
    await this.ensureGraph()
    if (this.element.ended) this.element.currentTime = 0
    await this.element.play()
  }

  pause(): void {
    this.element.pause()
  }

  seek(time: number): void {
    const d = this.element.duration
    const max = Number.isFinite(d) ? d : time
    this.element.currentTime = Math.max(0, Math.min(time, max))
  }

  setSrc(src: string): void {
    const el = this.element
    el.pause()
    if (el.src !== new URL(src, window.location.href).href) {
      el.src = src
      el.load()
    }
    el.currentTime = 0
  }
}

export const audioSession = new AudioSession()
