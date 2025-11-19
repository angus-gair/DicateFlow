import React from 'react';
import { XIcon, TerminalIcon } from './Icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const TechRecommendation: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-850 border border-gray-750 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-750">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TerminalIcon className="text-brand-500" />
            Fedora: Tauri 2 vs Electron
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <XIcon />
          </button>
        </div>
        
        <div className="p-6 space-y-6 text-gray-300">
          <div className="p-4 bg-brand-900/20 border border-brand-500/30 rounded-lg">
            <h3 className="text-brand-400 font-bold mb-2">Recommendation: Use Tauri 2</h3>
            <p className="text-sm">
              For a Linux Fedora environment, Tauri v2 is significantly better than Electron for a simple dictation utility. This specific application you are seeing is the <strong>Frontend/Renderer</strong> layer that would work identically in both, but the wrapper matters.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-bold text-white text-lg border-b border-gray-750 pb-2">Tauri 2 (Winner)</h4>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li><strong>Native Footprint:</strong> Uses WebKitGTK (native to Fedora/GNOME). The binary will be ~4-8MB instead of 100MB+.</li>
                <li><strong>Resource Usage:</strong> Uses a fraction of the RAM compared to Electron. Crucial if users run this in the background while working.</li>
                <li><strong>Integration:</strong> Rust backend offers superior performance for system-level audio piping if you expand features later.</li>
                <li><strong>Fedora Compatibility:</strong> `dnf install webkit2gtk4.0-devel` is standard and stable.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-400 text-lg border-b border-gray-750 pb-2">Electron</h4>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li><strong>Bloat:</strong> Bundles an entire Chromium instance. Massive binary size for a simple tool.</li>
                <li><strong>Performance:</strong> High memory overhead per window.</li>
                <li><strong>Pros:</strong> Only better if you need pixel-perfect consistency with Chrome on Windows/Mac without testing WebKit quirks.</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 font-mono bg-gray-950 p-3 rounded">
            <p className="mb-1"># To build this project for Tauri:</p>
            <p>1. npm install -D @tauri-apps/cli</p>
            <p>2. npx tauri init</p>
            <p>3. Modify tauri.conf.json to point to your build folder (dist)</p>
            <p>4. npx tauri dev</p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-750 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-750 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TechRecommendation;
