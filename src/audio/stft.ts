import { decodeMono, SAMPLE_RATE } from './pcm'

export const F_MIN = 80
export const F_MAX = 8000
export const DB_MIN = -80
export const DB_MAX = 0

export type SpectrogramData = {
  /** dB values, frame-major, bins low→high. Length = nFrames * nBins. */
  db: Float32Array
  nFrames: number
  nBins: number
  duration: number
  sampleRate: number
  fMin: number
  fMax: number
  dbMin: number
  dbMax: number
}

const FFT_SIZE = 1024
const HOP = 256
const LOG_BINS = 256
let bundled: { src: string; result: Promise<SpectrogramData> } | undefined

export function computeSpectrogram(src: string, samples?: Float32Array): Promise<SpectrogramData> {
  if (samples) return Promise.resolve().then(() => spectrumFromSamples(samples))
  if (bundled?.src === src) return bundled.result
  const result = fetch(src)
    .then(response => {
      if (!response.ok) throw new Error('无法读取音频。')
      return response.blob()
    })
    .then(decodeMono)
    .then(spectrumFromSamples)
    .catch(error => {
      if (bundled?.src === src) bundled = undefined
      throw error
    })
  bundled = { src, result }
  return result
}

function spectrumFromSamples(samples: Float32Array): SpectrogramData {
  const sampleRate = SAMPLE_RATE
  const duration = samples.length / sampleRate
  const hop = Math.max(HOP, Math.ceil(samples.length / 1600))

  const window = hann(FFT_SIZE)
  let windowSum = 0
  for (let i = 0; i < FFT_SIZE; i++) windowSum += window[i]!
  const ampRef = windowSum / 2

  const nFrames = Math.max(1, Math.ceil(samples.length / hop))
  const db = new Float32Array(nFrames * LOG_BINS)
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const linearBins = FFT_SIZE / 2 + 1
  const linearDb = new Float32Array(linearBins)

  for (let f = 0; f < nFrames; f++) {
    const offset = f * hop
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = offset + i < samples.length ? samples[offset + i]! : 0
      re[i] = s * window[i]!
    }
    fftRadix2(re, im)
    for (let k = 0; k < linearBins; k++) {
      const mag = Math.hypot(re[k]!, im[k]!) / ampRef
      linearDb[k] = 20 * Math.log10(Math.max(mag, 1e-10))
    }
    logMapFrame(linearDb, sampleRate, FFT_SIZE, LOG_BINS, F_MIN, F_MAX, db, f * LOG_BINS)
  }

  return {
    db,
    nFrames,
    nBins: LOG_BINS,
    duration,
    sampleRate,
    fMin: F_MIN,
    fMax: F_MAX,
    dbMin: DB_MIN,
    dbMax: DB_MAX,
  }
}

export function dbAt(
  data: SpectrogramData,
  frame: number,
  bin: number,
): number {
  const f = Math.max(0, Math.min(data.nFrames - 1, frame))
  const b = Math.max(0, Math.min(data.nBins - 1, bin))
  return data.db[f * data.nBins + b]!
}

/** Bilinear sample in time (0–1) and log-frequency (0 = fMin, 1 = fMax). */
export function sampleDb(data: SpectrogramData, timeRatio: number, freqRatio: number): number {
  const fx = Math.max(0, Math.min(1, timeRatio)) * (data.nFrames - 1)
  const fy = Math.max(0, Math.min(1, freqRatio)) * (data.nBins - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(data.nFrames - 1, x0 + 1)
  const y1 = Math.min(data.nBins - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const a = data.db[x0 * data.nBins + y0]!
  const b = data.db[x1 * data.nBins + y0]!
  const c = data.db[x0 * data.nBins + y1]!
  const d = data.db[x1 * data.nBins + y1]!
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

export function freqToRatio(freq: number, fMin = F_MIN, fMax = F_MAX): number {
  const clamped = Math.max(fMin, Math.min(fMax, freq))
  return Math.log(clamped / fMin) / Math.log(fMax / fMin)
}

// Quiet bins blend into the paper. Strong harmonics deepen from ochre to umber.
const colors = [[249, 245, 235], [245, 234, 211], [232, 204, 161],
  [209, 159, 111], [176, 108, 74], [122, 72, 54], [67, 44, 37]] as const
const palette = Array.from({ length: 256 }, (_, i) => {
  const t = (i / 255) * (colors.length - 1)
  const j = Math.min(Math.floor(t), colors.length - 2)
  return lerp3(colors[j], colors[j + 1], t - j)
})

export function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  data: SpectrogramData,
  width: number,
  height: number,
): void {
  const img = ctx.createImageData(width, height)
  const px = img.data
  for (let y = 0; y < height; y++) {
    const freqRatio = 1 - (y + 0.5) / height
    for (let x = 0; x < width; x++) {
      const timeRatio = (x + 0.5) / width
      const db = sampleDb(data, timeRatio, freqRatio)
      const intensity = (db - data.dbMin) / (data.dbMax - data.dbMin)
      const [r, g, b] = palette[Math.round(Math.max(0, Math.min(1, intensity)) * 255)]
      const i = (y * width + x) * 4
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ]
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n)
  if (n === 1) {
    w[0] = 1
    return w
  }
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  return w
}

function logMapFrame(
  linearDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  nBins: number,
  fMin: number,
  fMax: number,
  dest: Float32Array,
  destOffset: number,
): void {
  const binHz = sampleRate / fftSize
  const nLinear = linearDb.length
  for (let i = 0; i < nBins; i++) {
    const t = nBins === 1 ? 0 : i / (nBins - 1)
    const freq = fMin * Math.pow(fMax / fMin, t)
    const bin = freq / binHz
    const b0 = Math.max(0, Math.min(nLinear - 1, Math.floor(bin)))
    const b1 = Math.min(nLinear - 1, b0 + 1)
    const f = bin - Math.floor(bin)
    dest[destOffset + i] = linearDb[b0]! + (linearDb[b1]! - linearDb[b0]!) * f
  }
}

/** In-place iterative radix-2 Cooley–Tukey FFT. */
export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length
  if (n !== im.length || (n & (n - 1)) !== 0) {
    throw new Error('FFT 长度必须是 2 的幂')
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let j = 0; j < half; j++) {
        const p = i + j
        const q = p + half
        const vRe = re[q]! * wRe - im[q]! * wIm
        const vIm = re[q]! * wIm + im[q]! * wRe
        re[q] = re[p]! - vRe
        im[q] = im[p]! - vIm
        re[p] = re[p]! + vRe
        im[p] = im[p]! + vIm
        const nWRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nWRe
      }
    }
  }
}
