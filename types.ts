
export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
}

export enum RecordingStatus {
  RECORDING = 'RECORDING', // Active recording session
  PENDING = 'PENDING',     // Recorded, but not sent to API yet (or API failed)
  COMPLETED = 'COMPLETED', // Successfully transcribed
  ERROR = 'ERROR',         // API error / Network down
}

export interface TranscriptionResult {
  text: string;
  timestamp: number;
  durationSec: number;
}

export interface AudioVisualizerProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

export interface TranscriptionSegment {
  timestamp: string;
  text: string;
}

export interface RecordingSession {
  id: string;
  createdAt: number; // Timestamp for sorting
  blob: Blob;        // The raw audio
  status: RecordingStatus;
  segments: TranscriptionSegment[];
  errorMessage?: string;
}

export enum TranscriptionProvider {
  GEMINI = 'GEMINI',
  LOCAL = 'LOCAL',
}

export interface AppSettings {
  provider: TranscriptionProvider;
  geminiApiKey: string;
  localBaseUrl: string;
  localModelName: string;
  streamChunks: boolean;
  customVocabulary: string[]; // New: List of custom words/phrases
}
