export const SAMPLE_RATE = 16_000
export const MAX_SECONDS = 180

/** Decode at the service's sample rate, including WebM recordings without duration metadata. */
export async function decodeMono(file: Blob): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const audio = await context.decodeAudioData(await file.arrayBuffer())
  if (audio.numberOfChannels === 1) return audio.getChannelData(0)
  const samples = new Float32Array(audio.length)
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const channel = audio.getChannelData(ch)
    for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / audio.numberOfChannels
  }
  return samples
}

export function encodePcm(samples: Float32Array): Blob {
  const bytes = new ArrayBuffer(samples.length * 2)
  const view = new DataView(bytes)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, Math.round(s * (s < 0 ? 32768 : 32767)), true)
  }
  return new Blob([bytes], { type: 'application/octet-stream' })
}

/** A seekable playback file for MediaRecorder containers that omit their duration. */
export function playbackWav(pcm: Blob): Blob {
  const header = new ArrayBuffer(44), view = new DataView(header)
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  tag(0, 'RIFF')
  view.setUint32(4, 36 + pcm.size, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  tag(36, 'data')
  view.setUint32(40, pcm.size, true)
  return new Blob([header, pcm], { type: 'audio/wav' })
}
