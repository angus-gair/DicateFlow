export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
}

export enum RecordingStatus {
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