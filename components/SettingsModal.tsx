import React, { useEffect, useState } from 'react';
import { XIcon, SettingsIcon, CheckCircleIcon } from './Icons';
import { AppSettings, TranscriptionProvider } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, currentSettings, onSave }) => {
  const [formData, setFormData] = useState<AppSettings>(currentSettings);

  // Sync when modal opens
  useEffect(() => {
    if (isOpen) setFormData(currentSettings);
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleChange = (field: keyof AppSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-gray-850 border border-gray-750 rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-750 bg-gray-900">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <SettingsIcon className="text-gray-400" />
            Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <XIcon />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          
          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="text-xs font-mono text-gray-500 uppercase tracking-wider">Transcription Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormData(prev => ({ ...prev, provider: TranscriptionProvider.GEMINI }))}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition ${
                  formData.provider === TranscriptionProvider.GEMINI
                    ? 'bg-brand-900/20 border-brand-500 text-brand-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Google Gemini
                {formData.provider === TranscriptionProvider.GEMINI && <CheckCircleIcon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setFormData(prev => ({ ...prev, provider: TranscriptionProvider.LOCAL }))}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition ${
                  formData.provider === TranscriptionProvider.LOCAL
                    ? 'bg-purple-900/20 border-purple-500 text-purple-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Local / LM Studio
                {formData.provider === TranscriptionProvider.LOCAL && <CheckCircleIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Streaming Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-200">Stream in Chunks</span>
              <span className="text-xs text-gray-500">Transcribe every 5s while recording</span>
            </div>
            <button
              onClick={() => setFormData(prev => ({ ...prev, streamChunks: !prev.streamChunks }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${formData.streamChunks ? 'bg-brand-500' : 'bg-gray-600'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.streamChunks ? 'translate-x-4' : ''}`} />
            </button>
          </div>

          {/* Conditional Fields */}
          {formData.provider === TranscriptionProvider.GEMINI ? (
            <div className="p-4 bg-brand-900/10 border border-brand-500/20 rounded-lg text-sm text-brand-200">
              <p className="opacity-80">Using Cloud API (Gemini 2.5 Flash). The API Key is currently managed via environment variables.</p>
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-top-2">
               <div className="p-3 bg-purple-900/10 border border-purple-500/20 rounded text-xs text-purple-200 leading-relaxed">
                  <strong>Note:</strong> Requires a local server supporting the OpenAI <code>/v1/audio/transcriptions</code> endpoint (e.g., LM Studio with audio plugin, Whisper.cpp server, or LocalAI).
               </div>

               <div className="space-y-1">
                 <label className="text-xs text-gray-400 block">Base URL</label>
                 <input 
                    type="text" 
                    value={formData.localBaseUrl}
                    onChange={(e) => handleChange('localBaseUrl', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                    placeholder="http://localhost:1234/v1"
                 />
               </div>

               <div className="space-y-1">
                 <label className="text-xs text-gray-400 block">Model Name</label>
                 <input 
                    type="text" 
                    value={formData.localModelName}
                    onChange={(e) => handleChange('localModelName', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                    placeholder="whisper-1"
                 />
               </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-750 bg-gray-900 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 hover:bg-gray-800 text-gray-400 rounded text-sm font-medium transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded text-sm font-medium transition shadow-lg shadow-brand-900/20"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;