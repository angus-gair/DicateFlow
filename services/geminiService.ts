
import { GoogleGenAI, Type } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";
import { TranscriptionSegment, AppSettings } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const transcribeAudio = async (
  audioBlob: Blob, 
  settings?: AppSettings,
  mimeType: string = 'audio/webm'
): Promise<TranscriptionSegment[]> => {
  if (!apiKey) {
    throw new Error("Missing API_KEY environment variable");
  }

  try {
    const base64Data = await blobToBase64(audioBlob);

    // Construct Vocabulary String
    let vocabularyInstruction = "";
    if (settings?.customVocabulary && settings.customVocabulary.length > 0) {
      const vocabList = settings.customVocabulary.join(', ');
      vocabularyInstruction = `
        6. **CUSTOM VOCABULARY**: The user has provided a list of specific technical terms or names. 
           You MUST prioritize these spellings if they appear in the audio:
           [ ${vocabList} ]
      `;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: `
              You are a specialized audio transcription AI. Your sole task is to transcribe speech verbatim.
              
              CRITICAL INSTRUCTIONS:
              1. **NO HALLUCINATIONS**: If the audio is silent, contains only background noise, music, or the speech is unintelligible, return an empty array []. 
              2. **FORBIDDEN PHRASES**: Absolutely DO NOT output generic filler text. Specifically, never output:
                 - "Welcome to the podcast"
                 - "Welcome to our podcast"
                 - "Thanks for watching"
                 - "Copyright"
                 - "Subtitle by..."
                 - "Amara.org"
                 - "Hello and welcome"
                 - "I speak very good English"
              3. **VERBATIM**: Transcribe exactly what is said. Do not summarize, elaborate, or correct grammar.
              4. **SEGMENTATION**: Split text by natural pauses.
              5. **FORMAT**: Return a JSON array with 'timestamp' (MM:SS) and 'text'.
              ${vocabularyInstruction}
            `
          }
        ]
      },
      config: {
        temperature: 0,
        topK: 1,
        topP: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timestamp: {
                type: Type.STRING,
                description: "Start time of the segment in MM:SS format"
              },
              text: {
                type: Type.STRING,
                description: "The transcribed text"
              }
            },
            required: ["timestamp", "text"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    
    const segments = JSON.parse(text) as TranscriptionSegment[];

    // Safety Net: Filter out common hallucinations that might still slip through
    const BLACKLISTED_PHRASES = [
      "welcome to the podcast",
      "welcome to our podcast",
      "thanks for watching",
      "copyright",
      "captioned by",
      "subscribe",
      "amara.org",
      "i speak very good english"
    ];

    return segments.filter(seg => {
      const lowerText = seg.text.toLowerCase().trim();
      
      // If text is extremely short and looks like a generic greeting, ignore it
      if (lowerText.length < 30 && BLACKLISTED_PHRASES.some(phrase => lowerText.includes(phrase))) {
        return false;
      }
      return true;
    });

  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};
