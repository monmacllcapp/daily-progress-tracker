/**
 * SoundwaveAnimation — Digital Dot Grid Visualizer
 *
 * 5 vertical bars x 3 dots each = 15 dots.
 * CSS-only animation with staggered delays creating a wave pattern.
 * When idle: dots are dim. When active: dots animate.
 */

interface SoundwaveAnimationProps {
  active?: boolean;
  size?: 'sm' | 'md';
}

const BARS = 5;
const DOTS_PER_BAR = 3;

export function SoundwaveAnimation({ active = false, size = 'md' }: SoundwaveAnimationProps) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5';
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-1';
  const barGap = size === 'sm' ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`flex items-center ${barGap}`}>
      {Array.from({ length: BARS }, (_, barIdx) => (
        <div key={barIdx} className={`flex flex-col ${gap}`}>
          {Array.from({ length: DOTS_PER_BAR }, (_, dotIdx) => {
            const delay = (barIdx * 0.15 + dotIdx * 0.1).toFixed(2);
            return (
              <div
                key={dotIdx}
                className={`${dotSize} rounded-full ${
                  active
                    ? 'bg-cyan-400 animate-jarvis-dot'
                    : 'bg-cyan-400/20'
                }`}
                style={
                  active
                    ? { animationDelay: `${delay}s` }
                    : undefined
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
