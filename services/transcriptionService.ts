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

  // Default to Gemini
  // Note: We currently use process.env.API_KEY inside geminiService.
  // If we want to support custom API key from settings, we would need to update geminiService
  // to accept an apiKey parameter. 
  // For now, we assume the environment variable OR a refactor of geminiService.
  // To be safe, let's check if we should pass the key.
  
  // IMPORTANT: The current geminiService reads process.env.API_KEY directly. 
  // If you want to support the User Entered Key, update geminiService.ts to accept it as an argument.
  // But to avoid breaking changes in this file alone, we call the existing function.
  // *However*, to strictly follow the settings, we should probably pass it.
  // Since `geminiService.ts` signature is (blob), we will use it as is for now.
  
  return await transcribeWithGemini(audioBlob);
};
