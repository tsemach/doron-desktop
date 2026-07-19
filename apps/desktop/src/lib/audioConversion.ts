// whisper-server requires 16kHz mono 16-bit PCM WAV natively. Recorded audio
// (e.g. VoiceFieldInput's audio/webm output) is converted here, entirely in
// the browser via the Web Audio API, so neither whisper-server nor this app
// needs an FFmpeg dependency for format conversion.

const WHISPER_SAMPLE_RATE = 16000;

async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }
}

function encodeWav16BitPcmMono(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Converts a recorded audio Blob (any format the browser's MediaRecorder
 * produced, e.g. audio/webm) into a 16kHz mono 16-bit PCM WAV Blob.
 */
export async function blobToWav16kMono(blob: Blob): Promise<Blob> {
  const decoded = await decodeAudioBlob(blob);

  // Rendering into a 1-channel OfflineAudioContext at the target sample rate
  // handles both the mono downmix and the resample in one step.
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE),
    WHISPER_SAMPLE_RATE
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  const samples = rendered.getChannelData(0);

  return encodeWav16BitPcmMono(samples, WHISPER_SAMPLE_RATE);
}
