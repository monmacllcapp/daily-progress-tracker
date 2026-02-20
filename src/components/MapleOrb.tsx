/**
 * MapleOrb — Floating Radial Waveform Ring
 *
 * Always-visible ambient orb in bottom-right corner.
 * Canvas-based radial equalizer with 64 bars arranged in a circle.
 * Bars react to audio via Web Audio API AnalyserNode.
 *
 * Visual style: Black Panther Griot / vibranium energy ring.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useJarvisStore } from '../store/jarvisStore';
import { getAnalyser as getAnalyserNode } from '../services/voice-mode';

const BAR_COUNT = 64;
const TWO_PI = Math.PI * 2;

// Color palette
const CYAN = { r: 34, g: 211, b: 238 };
const PURPLE = { r: 147, g: 51, b: 234 };
const SLATE = { r: 51, g: 65, b: 85 };

interface OrbColors {
  inner: { r: number; g: number; b: number };
  outer: { r: number; g: number; b: number };
  glow: string;
}

function getColorsForMode(mode: string): OrbColors {
  switch (mode) {
    case 'listening':
      return {
        inner: CYAN,
        outer: { r: 6, g: 182, b: 212 },
        glow: 'rgba(34, 211, 238, 0.4)',
      };
    case 'processing':
      return {
        inner: PURPLE,
        outer: CYAN,
        glow: 'rgba(147, 51, 234, 0.3)',
      };
    case 'speaking':
      return {
        inner: CYAN,
        outer: { r: 59, g: 130, b: 246 },
        glow: 'rgba(34, 211, 238, 0.5)',
      };
    default: // idle
      return {
        inner: SLATE,
        outer: { ...CYAN, r: CYAN.r * 0.4, g: CYAN.g * 0.4, b: CYAN.b * 0.4 },
        glow: 'rgba(34, 211, 238, 0.1)',
      };
  }
}

export function MapleOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const smoothedBars = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const sweepAngle = useRef(0);
  const breathePhase = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { voiceMode, isOpen, setIsOpen, liveTranscript } = useJarvisStore();

  // --- Canvas rendering ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.scale(dpr, dpr);
    }

    const cx = size / 2;
    const cy = size / 2;
    const innerRadius = size * 0.22;
    const maxBarHeight = size * 0.22;

    ctx.clearRect(0, 0, size, size);

    // Get audio data
    const analyser = getAnalyserNode();
    const frequencyData = new Uint8Array(BAR_COUNT);

    if (analyser && (voiceMode === 'listening' || voiceMode === 'speaking')) {
      analyser.getByteFrequencyData(frequencyData);
    }

    // Get colors for current mode
    const colors = getColorsForMode(voiceMode);

    // Update breathe phase (idle animation)
    breathePhase.current += 0.02;

    // Update sweep angle (processing animation)
    if (voiceMode === 'processing') {
      sweepAngle.current += 0.03;
    }

    // Draw center glow
    const glowRadius = innerRadius * (voiceMode === 'idle' ? 0.8 : 1.2);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    gradient.addColorStop(0, colors.glow);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, TWO_PI);
    ctx.fill();

    // Draw bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = (i / BAR_COUNT) * TWO_PI - Math.PI / 2;

      // Target height based on mode
      let targetHeight: number;

      if (voiceMode === 'listening' || voiceMode === 'speaking') {
        // Audio-reactive: map frequency data to bar height
        targetHeight = (frequencyData[i] / 255) * maxBarHeight;
      } else if (voiceMode === 'processing') {
        // Sweep effect: bars light up as sweep passes
        const barAngle = (i / BAR_COUNT) * TWO_PI;
        const sweepDelta = ((barAngle - sweepAngle.current) % TWO_PI + TWO_PI) % TWO_PI;
        const sweepFactor = sweepDelta < 0.8 ? 1 - sweepDelta / 0.8 : 0;
        targetHeight = maxBarHeight * 0.15 + maxBarHeight * 0.6 * sweepFactor;
      } else {
        // Idle: gentle breathing
        const breathe = Math.sin(breathePhase.current + i * 0.15) * 0.5 + 0.5;
        targetHeight = maxBarHeight * 0.05 + maxBarHeight * 0.08 * breathe;
      }

      // Smooth interpolation
      smoothedBars.current[i] += (targetHeight - smoothedBars.current[i]) * 0.15;
      const barHeight = Math.max(2, smoothedBars.current[i]);

      // Calculate bar position
      const x1 = cx + Math.cos(angle) * innerRadius;
      const y1 = cy + Math.sin(angle) * innerRadius;
      const x2 = cx + Math.cos(angle) * (innerRadius + barHeight);
      const y2 = cy + Math.sin(angle) * (innerRadius + barHeight);

      // Color: lerp from inner to outer based on height
      const t = barHeight / maxBarHeight;
      const r = Math.round(colors.inner.r + (colors.outer.r - colors.inner.r) * t);
      const g = Math.round(colors.inner.g + (colors.outer.g - colors.inner.g) * t);
      const b = Math.round(colors.inner.b + (colors.outer.b - colors.inner.b) * t);
      const alpha = voiceMode === 'idle' ? 0.4 + t * 0.4 : 0.6 + t * 0.4;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = voiceMode === 'idle' ? 1.5 : 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Draw inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius - 1, 0, TWO_PI);
    ctx.strokeStyle =
      voiceMode === 'idle'
        ? 'rgba(34, 211, 238, 0.15)'
        : voiceMode === 'processing'
          ? 'rgba(147, 51, 234, 0.4)'
          : 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    animFrameRef.current = requestAnimationFrame(draw);
  }, [voiceMode]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // --- Click handling ---
  const handleClick = useCallback(() => {
    // Use timeout to distinguish single vs double click
    if (clickTimer.current) {
      // Double-click: force start listening
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      import('../services/voice-mode').then((vm) => vm.forceStartListening());
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        // Single click: toggle panel
        setIsOpen(!isOpen);
      }, 250);
    }
  }, [isOpen, setIsOpen]);

  // Determine outer glow class
  const glowClass =
    voiceMode === 'listening'
      ? 'shadow-[0_0_30px_8px_rgba(34,211,238,0.35)]'
      : voiceMode === 'speaking'
        ? 'shadow-[0_0_35px_10px_rgba(34,211,238,0.45)]'
        : voiceMode === 'processing'
          ? 'shadow-[0_0_25px_6px_rgba(147,51,234,0.3)]'
          : 'shadow-[0_0_15px_3px_rgba(34,211,238,0.1)]';

  const orbSize = voiceMode === 'listening' || voiceMode === 'speaking' ? 64 : voiceMode === 'processing' ? 58 : 52;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-2">
      {/* Expanding pulse ring (listening only) */}
      <AnimatePresence>
        {voiceMode === 'listening' && (
          <motion.div
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            className="absolute rounded-full border border-cyan-400/40"
            style={{ width: orbSize, height: orbSize }}
          />
        )}
      </AnimatePresence>

      {/* Canvas orb */}
      <motion.button
        onClick={handleClick}
        animate={{
          width: orbSize,
          height: orbSize,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`relative rounded-full cursor-pointer transition-shadow duration-300 ${glowClass}`}
        style={{ background: 'radial-gradient(circle, rgba(15,23,42,0.9) 0%, rgba(10,14,26,0.95) 100%)' }}
        title={
          voiceMode === 'idle'
            ? 'Click to chat, double-click for voice'
            : voiceMode === 'listening'
              ? 'Listening...'
              : voiceMode === 'processing'
                ? 'Thinking...'
                : 'Speaking...'
        }
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-full"
          style={{ width: orbSize, height: orbSize }}
        />
      </motion.button>

      {/* Live transcript pill */}
      <AnimatePresence>
        {voiceMode === 'listening' && liveTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute -top-10 right-0 max-w-[200px] px-3 py-1.5 rounded-full bg-slate-800/90 border border-cyan-500/20 backdrop-blur-sm"
          >
            <p className="text-xs text-cyan-300 truncate">{liveTranscript}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* State label */}
      <AnimatePresence>
        {voiceMode !== 'idle' && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs font-medium tracking-wider uppercase text-cyan-400/70"
          >
            {voiceMode === 'listening' ? 'Listening' : voiceMode === 'processing' ? 'Thinking' : 'Speaking'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
