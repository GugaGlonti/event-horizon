import type { SpeedTrend } from '@/features/flight/flightInstruments';

const signals = [
  { trend: 'accelerating', label: 'ACCEL', color: 'text-phosphor', direction: -1 },
  { trend: 'decelerating', label: 'DECEL', color: 'text-instrument', direction: 1 },
] as const;

export function SpeedTrendIndicator({ trend, active }: { trend: SpeedTrend; active: boolean }) {
  return (
    <div
      role="img"
      aria-label={
        active
          ? trend === 'accelerating'
            ? 'Accelerating'
            : trend === 'decelerating'
              ? 'Decelerating'
              : 'Speed steady'
          : 'Speed indicators on standby'
      }
      className="mt-2 flex max-w-56 items-center justify-between gap-2 text-[10px] tracking-wider"
    >
      {signals.map(({ trend: signal, label, color, direction }) => {
        const lit = active && trend === signal;
        return (
          <span
            key={signal}
            aria-hidden="true"
            data-lit={lit}
            className={`flex items-center gap-1.5 ${lit ? color : 'text-phosphor-dim/55'}`}
          >
            <span className={`size-1.5 bg-current ${lit ? 'hud-signal' : 'opacity-30'}`} />
            <span>{label}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 16"
              className={`h-3 w-3.5 ${lit ? '' : 'opacity-30'}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {[0, 1, 2].map((index) => (
                <path
                  key={index}
                  d={direction === -1 ? 'm5 6 5-4 5 4' : 'm5 10 5 4 5-4'}
                  transform={`translate(0 ${index * direction * -4})`}
                  className={lit ? 'hud-chevron' : ''}
                  style={{ animationDelay: `${(2 - index) * 160}ms` }}
                />
              ))}
            </svg>
          </span>
        );
      })}
    </div>
  );
}
