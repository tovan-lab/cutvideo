import { TranscriptOptions, VideoTranscript } from '../types/aiContent';
import { VideoItem } from '../types/video';

export interface ITranscriptService {
  extractAudio(
    video: VideoItem,
    onProgress?: (msg: string) => void
  ): Promise<{ audioBlob: Blob; base64: string; mimeType: string; duration: number } | null>;

  transcribe(
    video: VideoItem,
    options?: TranscriptOptions
  ): Promise<VideoTranscript>;

  exportSubtitles(transcript: VideoTranscript, format: 'srt' | 'vtt' | 'txt'): string;

  downloadSubtitles(
    transcript: VideoTranscript,
    format: 'srt' | 'vtt' | 'txt',
    videoTitle?: string
  ): void;
}

/**
 * Pure client-side helper to encode PCM AudioBuffer into standard 16-bit Mono WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer, targetSampleRate = 16000): Blob {
  // Downsample to target sample rate for speech models (compact & high-clarity)
  const numberOfChannels = buffer.numberOfChannels;
  const originalSampleRate = buffer.sampleRate;
  const length = Math.round(buffer.duration * targetSampleRate);
  
  // Downmix to mono
  const monoData = new Float32Array(length);
  const ratio = originalSampleRate / targetSampleRate;

  // Mix all channels
  for (let c = 0; c < numberOfChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const origIndex = Math.min(channelData.length - 1, Math.round(i * ratio));
      monoData[i] += channelData[origIndex] / numberOfChannels;
    }
  }

  // Create WAV 16-bit PCM
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat: PCM
  view.setUint16(22, 1, true); // NumChannels: 1 (mono)
  view.setUint32(24, targetSampleRate, true); // SampleRate
  view.setUint32(28, targetSampleRate * 2, true); // ByteRate (SampleRate * 1 channel * 2 bytes)
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);

  // Write PCM samples with soft clipping
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, monoData[i]));
    const sample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, sample, true);
    offset += 2;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Converts a Blob to a base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function pad(num: number, size = 2): string {
  let s = num.toString();
  while (s.length < size) s = '0' + s;
  return s;
}

function formatTimeSrt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function formatTimeVtt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export class TranscriptService implements ITranscriptService {
  // Session cache: video.id -> VideoTranscript
  private transcriptCache = new Map<string, VideoTranscript>();

  /**
   * Extracts clean, downsampled 16kHz mono WAV audio directly in the client
   */
  async extractAudio(
    video: VideoItem,
    onProgress?: (msg: string) => void
  ): Promise<{ audioBlob: Blob; base64: string; mimeType: string; duration: number } | null> {
    if (!video.metadata.hasAudio) {
      return null;
    }

    onProgress?.('Đang đọc kênh âm thanh từ video...');

    try {
      const res = await fetch(video.url);
      const arrayBuffer = await res.arrayBuffer();

      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        throw new Error('Trình duyệt không hỗ trợ Web Audio API.');
      }

      onProgress?.('Đang giải mã âm thanh (Audio Decoding)...');
      const audioCtx = new AudioCtxClass();
      
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (decodeErr) {
        console.warn('decodeAudioData failed (video might lack audio track):', decodeErr);
        await audioCtx.close();
        return null;
      }

      await audioCtx.close();

      onProgress?.('Đang chuẩn hóa 16kHz Mono WAV cho AI...');
      const wavBlob = audioBufferToWav(audioBuffer, 16000);
      const base64 = await blobToBase64(wavBlob);

      return {
        audioBlob: wavBlob,
        base64,
        mimeType: 'audio/wav',
        duration: audioBuffer.duration,
      };
    } catch (err) {
      console.warn('Audio extraction failed:', err);
      return null;
    }
  }

  /**
   * Transcribes speech from the video audio using server-side Gemini 3.5 Transcribe
   */
  async transcribe(
    video: VideoItem,
    options?: TranscriptOptions
  ): Promise<VideoTranscript> {
    // 1. Check cache
    if (this.transcriptCache.has(video.id)) {
      options?.onProgress?.('Sử dụng dữ liệu transcript từ bộ nhớ phiên...');
      return this.transcriptCache.get(video.id)!;
    }

    if (!video.metadata.hasAudio) {
      const silentTranscript: VideoTranscript = {
        fullText: '',
        segments: [],
        hasSpeech: false,
        engineUsed: 'fallback',
      };
      this.transcriptCache.set(video.id, silentTranscript);
      return silentTranscript;
    }

    options?.onProgress?.('Đang trích xuất kênh âm thanh từ video...');
    const audioData = await this.extractAudio(video, options?.onProgress);

    if (!audioData) {
      const noAudioTranscript: VideoTranscript = {
        fullText: '',
        segments: [],
        hasSpeech: false,
        engineUsed: 'fallback',
      };
      this.transcriptCache.set(video.id, noAudioTranscript);
      return noAudioTranscript;
    }

    options?.onProgress?.('Gemini 3.5 Transcribe đang phân tích giọng nói & chuyển thành văn bản...');

    try {
      const response = await fetch('/api/ai/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioData: audioData.base64,
          mimeType: audioData.mimeType,
          duration: audioData.duration,
          language: options?.targetLanguage === 'en' ? 'en' : 'vi',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi chuyển ngữ qua Gemini API.');
      }

      const transcript: VideoTranscript = data.transcript;
      this.transcriptCache.set(video.id, transcript);
      return transcript;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API âm thanh.';
      console.warn('Transcription API failed:', msg);

      // Return graceful fallback without crashing
      const fallbackTranscript: VideoTranscript = {
        fullText: '',
        segments: [],
        hasSpeech: false,
        engineUsed: 'fallback',
      };
      this.transcriptCache.set(video.id, fallbackTranscript);
      return fallbackTranscript;
    }
  }

  /**
   * Export transcript segments into standard subtitle formats
   */
  exportSubtitles(transcript: VideoTranscript, format: 'srt' | 'vtt' | 'txt'): string {
    const segments = transcript.segments || [];

    if (format === 'txt') {
      if (segments.length === 0) {
        return transcript.fullText || '(Không có nội dung lời nói)';
      }
      return segments
        .map((s) => `[${pad(Math.floor(s.start / 60))}:${pad(Math.floor(s.start % 60))} - ${pad(Math.floor(s.end / 60))}:${pad(Math.floor(s.end % 60))}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
        .join('\n');
    }

    if (format === 'vtt') {
      let output = 'WEBVTT\n\n';
      segments.forEach((s, idx) => {
        output += `${idx + 1}\n`;
        output += `${formatTimeVtt(s.start)} --> ${formatTimeVtt(s.end)}\n`;
        output += `${s.text}\n\n`;
      });
      return output;
    }

    // Default: SRT
    let output = '';
    segments.forEach((s, idx) => {
      output += `${idx + 1}\n`;
      output += `${formatTimeSrt(s.start)} --> ${formatTimeSrt(s.end)}\n`;
      output += `${s.text}\n\n`;
    });
    return output.trim();
  }

  /**
   * Triggers client-side subtitle download
   */
  downloadSubtitles(
    transcript: VideoTranscript,
    format: 'srt' | 'vtt' | 'txt',
    videoTitle = 'video'
  ): void {
    const content = this.exportSubtitles(transcript, format);
    const mimeTypes: Record<string, string> = {
      srt: 'application/x-subrip',
      vtt: 'text/vtt',
      txt: 'text/plain',
    };

    const blob = new Blob([content], { type: `${mimeTypes[format]};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Clean filename
    const cleanTitle = videoTitle.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-\s]/g, '');
    a.download = `${cleanTitle}_transcript.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const transcriptService: ITranscriptService = new TranscriptService();
