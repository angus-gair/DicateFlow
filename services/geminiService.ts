import { GoogleGenAI, Type } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";
import { TranscriptionSegment } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const transcribeAudio = async (audioBlob: Blob, mimeType: string = 'audio/webm'): Promise<TranscriptionSegment[]> => {
  if (!apiKey) {
    throw new Error("Missing API_KEY environment variable");
  }

  try {
    const base64Data = await blobToBase64(audioBlob);

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
              You are a professional transcriptionist. 
              Your task is to transcribe the provided audio file.
              - Segment the text by natural pauses or sentences.
              - Provide a timestamp for each segment (format MM:SS).
              - Do not summarize. 
              - Return the result as a structured JSON array.
            `
          }
        ]
      },
      config: {
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
    
    return JSON.parse(text) as TranscriptionSegment[];
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};
