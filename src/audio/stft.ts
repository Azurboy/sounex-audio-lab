/** Offline STFT for a real spectrogram exhibit. No live model, no extra deps. */

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
const TARGET_RATE = 16000

const sampleCache = new Map<string, SpectrogramData>()

export function clearSpectrogramCache(src?: string): void {
  if (src) sampleCache.delete(src)
  else sampleCache.clear()
}

export async function computeSpectrogram(src: string): Promise<SpectrogramData> {
  const hit = sampleCache.get(src)
  if (hit) return hit

  const res = await fetch(src)
  if (!res.ok) throw new Error(`无法读取音频（${res.status}）`)
  const raw = await res.arrayBuffer()
  const ctx = new AudioContext()
  let buffer: AudioBuffer
  try {
    buffer = await ctx.decodeAudioData(raw.slice(0))
  } finally {
    await ctx.close()
  }

  const data = stftFromBuffer(buffer)
  // Cache official and blob URLs; revoked blobs are dropped by the caller.
  sampleCache.set(src, data)
  return data
}

export function stftFromBuffer(buffer: AudioBuffer): SpectrogramData {
  const mono = mixMono(buffer)
  const sr0 = buffer.sampleRate
  const samples = sr0 === TARGET_RATE ? mono : resampleLinear(mono, sr0, TARGET_RATE)
  const sampleRate = sr0 === TARGET_RATE ? sr0 : TARGET_RATE
  const duration = buffer.duration

  const window = hann(FFT_SIZE)
  let windowSum = 0
  for (let i = 0; i < FFT_SIZE; i++) windowSum += window[i]!
  const ampRef = windowSum / 2

  const nFrames = Math.max(1, Math.ceil(samples.length / HOP))
  const db = new Float32Array(nFrames * LOG_BINS)
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const linearBins = FFT_SIZE / 2 + 1
  const linearDb = new Float32Array(linearBins)

  for (let f = 0; f < nFrames; f++) {
    const offset = f * HOP
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

const PAPER = [240, 233, 220] as const
const INK3 = [139, 130, 115] as const
const INK2 = [98, 92, 80] as const
const INK = [41, 39, 31] as const
const ACCENT = [194, 96, 62] as const

/** Map dB to official-token RGB. Quiet→paper/ink3, peaks→ink then accent. */
export function colorFromDb(db: number, dbMin = DB_MIN, dbMax = DB_MAX): [number, number, number] {
  let t = (db - dbMin) / (dbMax - dbMin)
  t = Math.max(0, Math.min(1, t))
  t = t ** 0.85
  if (t < 0.18) return lerp3(PAPER, INK3, t / 0.18)
  if (t < 0.48) return lerp3(INK3, INK2, (t - 0.18) / 0.3)
  if (t < 0.78) return lerp3(INK2, INK, (t - 0.48) / 0.3)
  return lerp3(INK, ACCENT, (t - 0.78) / 0.22)
}

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
      const [r, g, b] = colorFromDb(db, data.dbMin, data.dbMax)
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

function mixMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length
  const ch = buffer.numberOfChannels
  if (ch === 1) return buffer.getChannelData(0).slice()
  const out = new Float32Array(n)
  const inv = 1 / ch
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) out[i]! += data[i]! * inv
  }
  return out
}

function resampleLinear(data: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return data
  const n = Math.max(1, Math.round((data.length * to) / from))
  const out = new Float32Array(n)
  const ratio = from / to
  const last = data.length - 1
  for (let i = 0; i < n; i++) {
    const x = i * ratio
    const j = Math.floor(x)
    const f = x - j
    const a = data[Math.min(j, last)]!
    const b = data[Math.min(j + 1, last)]!
    out[i] = a + (b - a) * f
  }
  return out
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
