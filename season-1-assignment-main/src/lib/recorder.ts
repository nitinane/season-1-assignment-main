export type MediaRecorderController = {
  mediaStream?: MediaStream;
  recorder?: MediaRecorder;
  chunks: Blob[];
  isRecording: boolean;
  onError?: (err: Error) => void;
};

function makeError(msg: string): Error {
  return new Error(msg);
}

export async function startRecording(): Promise<MediaRecorderController> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.start(250);

    return { mediaStream: stream, recorder, chunks, isRecording: true };
  } catch (e) {
    throw e instanceof Error ? e : makeError('Microphone permission denied.');
  }
}

export function stopRecording(controller: MediaRecorderController): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!controller.recorder || controller.recorder.state !== 'inactive') {
      reject(makeError('No active recording.'));
      return;
    }

    controller.recorder.onstop = () => {
      const blob = new Blob(controller.chunks, { type: 'audio/webm' });
      controller.chunks = [];
      controller.isRecording = false;
      controller.mediaStream?.getTracks().forEach((t) => t.stop());
      resolve(blob);
    };

    controller.recorder.stop();
  });
}

export async function decodeToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const pcm16 = downsampleMono16kHz(decoded, audioCtx);
    return encodePcm16Wav(pcm16);
  } catch (e) {
    throw e instanceof Error ? e : makeError('Failed to decode audio.');
  } finally {
    audioCtx.close();
  }
}

function downsampleMono16kHz(input: AudioBuffer, ctx: BaseAudioContext): AudioBuffer {
  const target = 16000;
  const inputRate = input.sampleRate;
  const numChannels = input.numberOfChannels;

  if (numChannels === 1 && inputRate === target) return input;

  const outLen = Math.ceil(input.length * (target / inputRate));
  const out = ctx.createBuffer(1, outLen, target);
  const outData = out.getChannelData(0);
  const step = inputRate / target;

  for (let i = 0; i < outLen; i++) {
    const t = i * step;
    const idx = Math.floor(t);
    const idx2 = Math.min(idx + 1, input.length - 1);
    const frac = t - idx;
    let s = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      s += input.getChannelData(ch)[idx] * (1 - frac) + input.getChannelData(ch)[idx2] * frac;
    }
    outData[i] = s / numChannels;
  }
  return out;
}

function encodePcm16Wav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const numSamples = buffer.length;
  const dataSize = numSamples * numChannels * (bitDepth / 8);
  const bufferSize = 44 + dataSize;

  const arr = new ArrayBuffer(bufferSize);
  const view = new DataView(arr);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let ch = 0; ch < numChannels; ch++) {
    for (let i = 0; i < numSamples; i++) {
      let s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arr], { type: 'audio/wav' });
}
