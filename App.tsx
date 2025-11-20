
import React, { useState, useRef, useEffect } from 'react';
import { 
  MicIcon, SquareIcon, CopyIcon, InfoIcon, LoaderIcon, 
  RefreshIcon, TrashIcon, CheckCircleIcon, 
  AlertCircleIcon, WifiOffIcon, SearchIcon, SettingsIcon,
  ChevronDownIcon, PlusCircleIcon, ArrowRightCircleIcon
} from './components/Icons';
import AudioVisualizer from './components/AudioVisualizer';
import TechRecommendation from './components/TechRecommendation';
import SettingsModal from './components/SettingsModal';
import { transcribe } from './services/transcriptionService';
import { AppState, RecordingSession, RecordingStatus, AppSettings, TranscriptionProvider, TranscriptionSegment } from './types';
import { formatTime, parseTime } from './utils/audioUtils';
import { saveRecordingToDB, getRecordingsFromDB, updateRecordingInDB, deleteOldRecordings, clearAllRecordings } from './utils/db';

const DEFAULT_SETTINGS: AppSettings = {
  provider: TranscriptionProvider.GEMINI,
  geminiApiKey: '', 
  localBaseUrl: 'http://localhost:1234/v1',
  localModelName: 'whisper-1',
  streamChunks: false,
  customVocabulary: []
};

const CHUNK_INTERVAL_MS = 5000;

type RecordingMode = 'NEW' | 'APPEND';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('NEW');
  
  // UI State
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  
  // Modals
  const [showTechModal, setShowTechModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [globalError, setGlobalError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chunkBufferRef = useRef<Blob[]>([]); 
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Streaming Refs
  const currentSessionIdRef = useRef<string | null>(null);
  const lastChunkTimeRef = useRef<number>(0);
  const chunkOffsetRef = useRef<number>(0);

  // Load history and settings
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedRecordings = await getRecordingsFromDB();
        const chronological = [...savedRecordings].sort((a, b) => b.createdAt - a.createdAt); // Newest first
        setRecordings(chronological);

        // Set active session to the newest one if exists
        if (chronological.length > 0) {
            setActiveSessionId(chronological[0].id);
        }

        const savedSettings = localStorage.getItem('dictateflow_settings');
        if (savedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
        }
      } catch (e) {
        console.error("Failed to load data", e);
      }
    };
    loadData();
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('dictateflow_settings', JSON.stringify(newSettings));
  };

  const createNewSession = (customId?: string): RecordingSession => {
    const id = customId || crypto.randomUUID();
    return {
        id,
        createdAt: Date.now(),
        blob: new Blob([], { type: 'audio/webm' }),
        status: RecordingStatus.RECORDING,
        segments: []
    };
  };

  const startRecording = async () => {
    try {
      setGlobalError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      
      const options = { mimeType: 'audio/webm' };
      const recorder = new MediaRecorder(mediaStream, MediaRecorder.isTypeSupported('audio/webm') ? options : undefined);
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      chunkBufferRef.current = [];
      
      let sessionId: string;
      
      if (recordingMode === 'NEW' || !activeSessionId) {
          const newSession = createNewSession();
          sessionId = newSession.id;
          setActiveSessionId(sessionId);
          setRecordings(prev => [newSession, ...prev]);
          currentSessionIdRef.current = sessionId;
          
          if (settings.streamChunks) {
            chunkOffsetRef.current = 0;
            lastChunkTimeRef.current = Date.now();
          }
      } else {
          // APPEND MODE
          sessionId = activeSessionId;
          currentSessionIdRef.current = sessionId;
          
          setRecordings(prev => prev.map(r => r.id === sessionId ? { ...r, status: RecordingStatus.RECORDING } : r));
          
          if (settings.streamChunks) {
              const activeSession = recordings.find(r => r.id === sessionId);
              let lastTime = 0;
              if (activeSession && activeSession.segments.length > 0) {
                  const lastSeg = activeSession.segments[activeSession.segments.length - 1];
                  lastTime = parseTime(lastSeg.timestamp) + 5;
              }
              chunkOffsetRef.current = lastTime;
              lastChunkTimeRef.current = Date.now();
          }
      }
      
      setAppState(AppState.RECORDING);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          if (settings.streamChunks) {
            chunkBufferRef.current.push(event.data);
            const now = Date.now();
            if (now - lastChunkTimeRef.current >= CHUNK_INTERVAL_MS) {
              processCurrentChunk();
              lastChunkTimeRef.current = now;
            }
          }
        }
      };

      recorder.onstop = () => handleStop(sessionId); 

      recorder.start(1000); 

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setGlobalError("Microphone access denied.");
      setAppState(AppState.ERROR);
    }
  };

  const processCurrentChunk = async () => {
    if (chunkBufferRef.current.length === 0 || !currentSessionIdRef.current) return;

    const chunkBlob = new Blob(chunkBufferRef.current, { type: 'audio/webm' });
    chunkBufferRef.current = []; 
    
    const timeOffset = chunkOffsetRef.current; 
    chunkOffsetRef.current += (CHUNK_INTERVAL_MS / 1000); 

    try {
      const segments = await transcribe(chunkBlob, settings);
      
      const adjustedSegments = segments.map(seg => {
        const seconds = parseTime(seg.timestamp);
        const totalSeconds = seconds + timeOffset;
        return {
          ...seg,
          timestamp: formatTime(totalSeconds)
        };
      });

      if (adjustedSegments.length > 0) {
        setRecordings(prev => prev.map(rec => {
          if (rec.id === currentSessionIdRef.current) {
            const allSegments = [...rec.segments, ...adjustedSegments];
            // Sort segments by timestamp to fix out-of-order chunks
            allSegments.sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));
            
            return {
              ...rec,
              segments: allSegments
            };
          }
          return rec;
        }));
        
        setTimeout(() => {
           messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (e) {
      console.warn("Chunk transcription failed (ignoring for stream):", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStop = async (sessionId: string) => {
    const fullAudioBlob = new Blob(audioChunks