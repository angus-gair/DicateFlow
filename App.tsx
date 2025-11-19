
import React, { useState, useRef, useEffect } from 'react';
import { 
  MicIcon, SquareIcon, CopyIcon, InfoIcon, LoaderIcon, 
  RefreshIcon, TrashIcon, ChevronDownIcon, CheckCircleIcon, 
  AlertCircleIcon, WifiOffIcon, SearchIcon, SettingsIcon 
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

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Modals
  const [showTechModal, setShowTechModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState<boolean>(false);
  
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [globalError, setGlobalError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chunkBufferRef = useRef<Blob[]>([]); // For streaming
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Streaming Refs
  const currentSessionIdRef = useRef<string | null>(null);
  const lastChunkTimeRef = useRef<number>(0);
  const chunkOffsetRef = useRef<number>(0);

  // Load history and settings
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedRecordings = await getRecordingsFromDB();
        const chronological = [...savedRecordings].sort((a, b) => a.createdAt - b.createdAt);
        setRecordings(chronological);

        const savedSettings = localStorage.getItem('dictateflow_settings');
        if (savedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
        }
      } catch (e) {
        console.error("Failed to load data", e);
      }
    };
    loadData();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('dictateflow_settings', JSON.stringify(newSettings));
  };

  const startRecording = async () => {
    try {
      setGlobalError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      
      const options = { mimeType: 'audio/webm' };
      // Using 1000ms timeslice to get data every second for potential processing
      const recorder = new MediaRecorder(mediaStream, MediaRecorder.isTypeSupported('audio/webm') ? options : undefined);
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      chunkBufferRef.current = [];
      
      const sessionId = crypto.randomUUID();
      currentSessionIdRef.current = sessionId;
      
      // Initialize State for UI
      setAppState(AppState.RECORDING);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // If streaming, create session immediately
      if (settings.streamChunks) {
        const initialSession: RecordingSession = {
          id: sessionId,
          createdAt: Date.now(),
          blob: new Blob([], { type: 'audio/webm' }), // Empty initially
          status: RecordingStatus.RECORDING,
          segments: []
        };
        setRecordings(prev => [...prev, initialSession]);
        lastChunkTimeRef.current = Date.now();
        chunkOffsetRef.current = 0;
      }

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

      recorder.onstop = () => handleStop(sessionId); // Pass ID to ensure we reference correct session

      recorder.start(1000); // Trigger dataavailable every 1s

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setGlobalError("Microphone access denied.");
      setAppState(AppState.ERROR);
    }
  };

  const processCurrentChunk = async () => {
    if (chunkBufferRef.current.length === 0 || !currentSessionIdRef.current) return;

    const chunkBlob = new Blob(chunkBufferRef.current, { type: 'audio/webm' });
    chunkBufferRef.current = []; // Clear buffer
    
    // Calculate offset before async op
    const timeOffset = chunkOffsetRef.current; 
    
    // Update offset for NEXT chunk. This is naive but works for 5s chunks.
    chunkOffsetRef.current += (CHUNK_INTERVAL_MS / 1000); 

    try {
      const segments = await transcribe(chunkBlob, settings);
      
      // Adjust timestamps
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
            // Combine with existing segments
            const allSegments = [...rec.segments, ...adjustedSegments];
            // SORT by timestamp to fix out-of-order async responses
            allSegments.sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));

            return {
              ...rec,
              segments: allSegments
            };
          }
          return rec;
        }));
        
        // Auto-scroll
        setTimeout(() => {
           messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (e) {
      console.warn("Chunk transcription failed (ignoring for stream):", e);
      // We don't fail the session in streaming mode, just skip the chunk output
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
    const fullAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    if (settings.streamChunks) {
      // Process any remaining data
      await processCurrentChunk();
      
      // Finalize the streaming session
      const completedSession: RecordingSession = {
        id: sessionId,
        createdAt: Date.now(), // Keep original or update? Keep logic simple
        blob: fullAudioBlob, // Save full blob
        status: RecordingStatus.COMPLETED,
        // Segments are already in state from streaming
        segments: recordings.find(r => r.id === sessionId)?.segments || []
      };
      
      // Ensure we have the latest segments from state before saving
      setRecordings(prev => {
        const session = prev.find(r => r.id === sessionId);
        const finalSegments = session ? session.segments : [];
        
        const finalSession = { ...completedSession, segments: finalSegments };
        saveRecordingToDB(finalSession); // Fire and forget DB save
        updateRecordingInDB(finalSession);
        
        return prev.map(r => r.id === sessionId ? finalSession : r);
      });

      setAppState(AppState.IDLE);
      setLastSaved(new Date());

    } else {
      // STANDARD MODE (Process at end)
      const newSession: RecordingSession = {
        id: sessionId,
        createdAt: Date.now(),
        blob: fullAudioBlob,
        status: RecordingStatus.PENDING,
        segments: []
      };

      await saveRecordingToDB(newSession);
      await deleteOldRecordings();
      setLastSaved(new Date());

      setRecordings(prev => [...prev, newSession]);
      setAppState(AppState.PROCESSING);

      await processSession(newSession);
    }
    
    currentSessionIdRef.current = null;
  };

  const processSession = async (session: RecordingSession) => {
    try {
      const newSegments = await transcribe(session.blob, settings);
      
      const updatedSession: RecordingSession = {
        ...session,
        status: RecordingStatus.COMPLETED,
        segments: newSegments,
        errorMessage: undefined
      };

      await updateRecordingInDB(updatedSession);
      setLastSaved(new Date());

      setRecordings(prev => prev.map(r => r.id === session.id ? updatedSession : r));
      setAppState(AppState.IDLE);
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

    } catch (error: any) {
      console.error("Processing error:", error);
      let msg = "Failed to transcribe.";
      if (error instanceof Error) msg = error.message;
      
      if (settings.provider === TranscriptionProvider.LOCAL && msg.includes('Failed to fetch')) {
        msg = "Could not connect to Local Server. Ensure it is running.";
      }

      const failedSession: RecordingSession = {
        ...session,
        status: RecordingStatus.ERROR,
        errorMessage: msg
      };

      await updateRecordingInDB(failedSession);
      setRecordings(prev => prev.map(r => r.id === session.id ? failedSession : r));
      
      setGlobalError(msg);
      setAppState(AppState.IDLE);
    }
  };

  const handleRetry = async (session: RecordingSession) => {
     setAppState(AppState.PROCESSING);
     setGlobalError(null);
     
     const pendingSession: RecordingSession = {
       ...session,
       status: RecordingStatus.PENDING,
       errorMessage: undefined
     };
     
     setRecordings(prev => prev.map(r => r.id === session.id ? pendingSession : r));
     await updateRecordingInDB(pendingSession);

     await processSession(pendingSession);
  };

  const handleSegmentChange = (sessionId: string, segmentIndex: number, newText: string) => {
    setRecordings(prev => {
      const updatedRecordings = prev.map(rec => {
        if (rec.id !== sessionId) return rec;
        
        const updatedSegments = [...rec.segments];
        updatedSegments[segmentIndex] = { ...updatedSegments[segmentIndex], text: newText };
        
        const updatedRec = { ...rec, segments: updatedSegments };
        updateRecordingInDB(updatedRec);
        return updatedRec;
      });
      return updatedRecordings;
    });
    setLastSaved(new Date());
  };

  const clearAll = async () => {
    if (window.confirm("Are you sure you want to clear all history? This cannot be undone.")) {
      await clearAllRecordings();
      setRecordings([]);
      setGlobalError(null);
    }
  };

  const copyAllText = () => {
    const fullText = recordings
      .filter(r => r.status === RecordingStatus.COMPLETED)
      .flatMap(r => r.segments.map(s => s.text))
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
  };

  const historyList = [...recordings].sort((a, b) => b.createdAt - a.createdAt);

  const filteredRecordings = recordings.filter(session => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return session.segments.some(segment => segment.text.toLowerCase().includes(query));
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100 selection:bg-brand-500/30">
      <TechRecommendation isOpen={showTechModal} onClose={() => setShowTechModal(false)} />
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
        currentSettings={settings}
        onSave={handleSaveSettings}
      />
      
      {/* Header */}
      <header className="h-12 border-b border-gray-850 flex items-center justify-between px-4 select-none relative z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
          </div>
          
          {/* Dropdown Trigger */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-900 transition group"
            >
              <span className="text-xs font-mono text-gray-500 font-bold group-hover:text-gray-300 transition-colors">
                DICTATE.FLOW // HISTORY
              </span>
              <ChevronDownIcon className={`w-3 h-3 text-gray-600 transition-transform duration-200 ${showHistoryDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {showHistoryDropdown && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                 <div className="p-3 border-b border-gray-800 text-[10px] text-gray-500 font-mono uppercase tracking-wider flex justify-between">
                   <span>Recent Recordings ({historyList.length})</span>
                   <span>Limit: 20</span>
                 </div>
                 <div className="max-h-80 overflow-y-auto">
                   {historyList.length === 0 ? (
                     <div className="p-4 text-center text-gray-600 text-xs">No recordings yet.</div>
                   ) : (
                     historyList.map(rec => (
                       <button
                         key={rec.id}
                         onClick={() => {
                           document.getElementById(`session-${rec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                           setShowHistoryDropdown(false);
                           if (rec.status === RecordingStatus.ERROR) {
                             handleRetry(rec);
                           }
                         }}
                         className="w-full text-left p-3 hover:bg-gray-800 border-b border-gray-800/50 flex items-center justify-between group transition"
                       >
                         <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-gray-300 group-hover:text-white">
                              {new Date(rec.createdAt).toLocaleTimeString()}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {new Date(rec.createdAt).toLocaleDateString()}
                            </span>
                         </div>
                         
                         {rec.status === RecordingStatus.COMPLETED ? (
                           <CheckCircleIcon className="w-4 h-4 text-green-500" />
                         ) : rec.status === RecordingStatus.PENDING || rec.status === RecordingStatus.RECORDING ? (
                           <LoaderIcon className="w-4 h-4 text-yellow-500 animate-spin" />
                         ) : (
                           <div className="flex items-center gap-1">
                             <span className="text-[10px] text-red-400 font-bold uppercase">Failed</span>
                             <AlertCircleIcon className="w-4 h-4 text-red-500" />
                           </div>
                         )}
                       </button>
                     ))
                   )}
                 </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {settings.streamChunks && appState === AppState.RECORDING && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-[10px] font-bold animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              LIVE
            </div>
          )}

          <button 
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition px-2 py-1 rounded hover:bg-gray-900"
            title="Configure Provider"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => setShowTechModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-brand-400 transition px-2 py-1 rounded hover:bg-gray-900"
          >
            <InfoIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-6 gap-6 h-[calc(100vh-3rem)]">
        
        {/* Visualization Area */}
        <section className="space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Signal Input</h2>
            <div className="flex items-center gap-3">
               <span className="text-[10px] font-mono uppercase text-gray-600 px-2 py-0.5 bg-gray-900 rounded border border-gray-800">
                 VIA: {settings.provider} {settings.streamChunks ? '(STREAM)' : ''}
               </span>
               <div className="font-mono text-brand-500 text-sm">
                 {formatTime(recordingTime)}
               </div>
            </div>
          </div>
          <AudioVisualizer stream={stream} isRecording={appState === AppState.RECORDING} />
        </section>

        {/* Controls */}
        <div className="flex justify-center py-4 flex-shrink-0">
          {appState === AppState.RECORDING ? (
            <button
              onClick={stopRecording}
              className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            >
              <SquareIcon className="w-6 h-6 fill-current" />
              <span className="absolute -bottom-8 text-xs font-medium text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">STOP</span>
            </button>
          ) : appState === AppState.PROCESSING ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center border border-brand-500/50">
                 <LoaderIcon className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
              <span className="text-xs text-brand-400 font-mono animate-pulse">SAVING & TRANSCRIBING...</span>
            </div>
          ) : (
            <button
              onClick={startRecording}
              className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 border border-gray-700 text-gray-100 hover:bg-brand-600 hover:border-brand-500 transition-all duration-300 shadow-lg"
            >
              <MicIcon className="w-6 h-6" />
              <span className="absolute -bottom-8 text-xs font-medium text-gray-500 group-hover:text-brand-400 transition-colors">RECORD</span>
            </button>
          )}
        </div>

        {/* Global Error Toast (Ephemeral) */}
        {globalError && (
           <div className="flex-shrink-0 bg-red-900/20 border border-red-500/30 text-red-400 p-4 rounded-lg text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
             <AlertCircleIcon className="w-5 h-5" />
             <span>{globalError} Check the list below to retry.</span>
           </div>
        )}

        {/* Editor Area */}
        <section className="flex-1 flex flex-col gap-2 min-h-0 bg-gray-850/50 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 gap-4">
             <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest hidden md:block">Transcript History</h2>
             
             {/* Search Bar */}
             <div className="flex-1 max-w-md relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="Search transcripts..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-full pl-9 pr-4 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-brand-500 transition-colors placeholder-gray-600"
                />
             </div>

             <div className="flex items-center gap-2">
               <button 
                 onClick={clearAll}
                 className="text-xs flex items-center gap-1 text-gray-500 hover:text-red-400 transition px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap"
                 disabled={recordings.length === 0}
               >
                 <TrashIcon className="w-3 h-3" />
                 <span className="hidden sm:inline">CLEAR ALL</span>
               </button>
               <button 
                 onClick={copyAllText}
                 className="text-xs flex items-center gap-1 text-gray-500 hover:text-white transition px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap"
                 disabled={recordings.length === 0}
               >
                 <CopyIcon className="w-3 h-3" />
                 <span className="hidden sm:inline">COPY ALL</span>
               </button>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
            {recordings.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                <MicIcon className="w-8 h-8" />
                <span className="text-sm">Ready to record. History is empty.</span>
              </div>
            ) : filteredRecordings.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                <SearchIcon className="w-8 h-8" />
                <span className="text-sm">No matching transcripts found.</span>
              </div>
            ) : (
              filteredRecordings.map((session) => (
                <div key={session.id} id={`session-${session.id}`} className="border-b border-gray-800/50 pb-6 last:border-0">
                  
                  {/* Session Header */}
                  <div className="flex items-center gap-3 mb-3 opacity-60">
                    <span className="text-[10px] font-mono bg-gray-800 px-1.5 rounded text-gray-400">
                      {new Date(session.createdAt).toLocaleTimeString()}
                    </span>
                    {session.status === RecordingStatus.RECORDING && (
                      <span className="text-[10px] font-mono bg-red-900/40 border border-red-500/30 px-1.5 rounded text-red-400 animate-pulse">
                        REC
                      </span>
                    )}
                    <div className="h-px bg-gray-800 flex-1" />
                  </div>

                  {/* Session Content based on Status */}
                  {(session.status === RecordingStatus.COMPLETED || session.status === RecordingStatus.RECORDING) ? (
                    <div className="space-y-4">
                       {session.segments.length === 0 && session.status === RecordingStatus.RECORDING && (
                         <div className="text-xs text-gray-600 italic pl-1">Listening...</div>
                       )}
                      {session.segments.map((segment, idx) => (
                        <div key={idx} className="group flex gap-4 items-start animate-in fade-in slide-in-from-bottom-1">
                           <div className="flex-shrink-0 w-16 pt-1">
                            <span className="text-xs font-mono text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                              {segment.timestamp}
                            </span>
                          </div>
                          <textarea
                            value={segment.text}
                            onChange={(e) => handleSegmentChange(session.id, idx, e.target.value)}
                            className="flex-1 bg-transparent border-none p-0 text-gray-200 font-sans text-lg leading-relaxed resize-none focus:outline-none focus:ring-0 placeholder-gray-700"
                            rows={1}
                            style={{ height: 'auto', minHeight: '28px' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                            ref={el => {
                              if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                              }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : session.status === RecordingStatus.ERROR ? (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-4 flex items-center justify-between gap-4">
                       <div className="flex items-center gap-3 text-red-400">
                          <WifiOffIcon className="w-5 h-5" />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">Transcription Failed</span>
                            <span className="text-xs opacity-75">
                              Audio saved locally. {session.errorMessage || "Network or API error."}
                            </span>
                          </div>
                       </div>
                       <button 
                         onClick={() => handleRetry(session)}
                         className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded flex items-center gap-2 transition shadow-lg shadow-red-900/20"
                       >
                         <RefreshIcon className="w-3.5 h-3.5" />
                         RETRY
                       </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed">
                      <LoaderIcon className="w-4 h-4 text-brand-500 animate-spin" />
                      <span className="text-sm text-gray-500 italic">Processing audio via {settings.provider}...</span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

      </main>
      
      {/* Footer Status Bar */}
      <footer className="h-8 bg-gray-900 border-t border-gray-850 flex items-center justify-between px-4 text-[10px] font-mono text-gray-500 select-none flex-shrink-0">
        <div className="flex gap-4">
           <span>STATUS: {appState}</span>
           <span>DB: INDEXED-DB</span>
        </div>
        <div>
          {lastSaved && (
            <span className="text-brand-500 mr-4 transition-opacity duration-1000">
              AUTOSAVED: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          ITEMS: {recordings.length}/20
        </div>
      </footer>
    </div>
  );
};

export default App;
