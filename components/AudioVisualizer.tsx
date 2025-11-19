import React, { useEffect, useRef } from 'react';
import { AudioVisualizerProps } from '../types';

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode>();
  const contextRef = useRef<AudioContext>();

  useEffect(() => {
    if (!stream || !isRecording) {
      // Cleanup if stopped
      if (contextRef.current && contextRef.current.state !== 'closed') {
        contextRef.current.close();
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      // Clear canvas
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw a flat line
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.strokeStyle = '#4a5568';
        ctx.stroke();
      }
      return;
    }

    const initAudio = () => {
      // Fix: Cast window to any to access webkitAudioContext for broader browser support
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      contextRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      animate();
    };

    const animate = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      
      if (!canvas || !analyser) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#0d1117'; // Match bg
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6'; // Brand blue
      ctx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      requestRef.current = requestAnimationFrame(animate);
    };

    initAudio();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (contextRef.current) contextRef.current.close();
    };
  }, [stream, isRecording]);

  return (
    <div className="w-full h-32 bg-gray-950 rounded-lg overflow-hidden border border-gray-850 relative">
       <canvas 
        ref={canvasRef} 
        width={800} 
        height={128} 
        className="w-full h-full"
      />
      {!isRecording && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm uppercase tracking-wider font-mono">
          Ready to Record
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;