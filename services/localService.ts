
import { AppSettings, TranscriptionSegment } from "../types";
import { formatTime } from "../utils/audioUtils";

export const transcribeWithLocal = async (
  audioBlob: Blob, 
  settings: AppSettings
): Promise<TranscriptionSegment[]> => {
  
  // Normalize Base URL: Ensure no trailing slash, ensure http(s)
  let baseUrl = settings.localBaseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl.startsWith('http')) {
    baseUrl = `http://${baseUrl}`;
  }

  // Standard OpenAI Audio Endpoint
  const endpoint = `${baseUrl}/audio/transcriptions`;

  const formData = new FormData();
  // Append file with a filename so the server can detect extension (often needed for whisper)
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('model', settings.localModelName || 'whisper-1');
  
  // Request verbose JSON to hopefully get segments
  formData.append('response_format', 'verbose_json');

  // Pass Custom Vocabulary as the 'prompt' to guide Whisper
  if (settings.customVocabulary && settings.customVocabulary.length > 0) {
    // Whisper prompt has a limit (often 244 tokens), so we just join them.
    // It biases the model to these words.
    const promptText = `The transcript contains the following technical terms: ${settings.customVocabulary.join(', ')}.`;
    formData.append('prompt', promptText);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      // Note: Content-Type header is automatically set by browser for FormData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local Server Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // Normalize the output to our TranscriptionSegment format
    return mapLocalResponseToSegments(data);

  } catch (error) {
    console.error("Local Transcription Error:", error);
    throw error;
  }
};

/**
 * Maps various OpenAI-compatible JSON responses to our strict TranscriptionSegment[] format.
 */
function mapLocalResponseToSegments(data: any): TranscriptionSegment[] {
  // Case 1: Verbose JSON with segments (Standard Whisper)
  if (data.segments && Array.isArray(data.segments)) {
    return data.segments.map((s: any) => ({
      timestamp: formatTime(s.start || 0),
      text: (s.text || "").trim()
    }));
  }

  // Case 2: Simple JSON or Text (Fallback)
  // Some local servers might just return { text: "..." } even with verbose_json
  if (data.text) {
    return [{
      timestamp: "00:00",
      text: data.text.trim()
    }];
  }

  throw new Error("Unknown response format from local server.");
}
