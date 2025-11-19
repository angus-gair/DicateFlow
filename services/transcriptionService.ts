
import { transcribeAudio as transcribeWithGemini } from './geminiService';
import { transcribeWithLocal } from './localService';
import { AppSettings, TranscriptionProvider, TranscriptionSegment } from '../types';

export const transcribe = async (
  audioBlob: Blob, 
  settings: AppSettings
): Promise<TranscriptionSegment[]> => {
  
  if (settings.provider === TranscriptionProvider.LOCAL) {
    return await transcribeWithLocal(audioBlob, settings);
  }

  return await transcribeWithGemini(audioBlob, settings);
};
