import { useId, useMemo } from 'react';
import { instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import { SYSTEMS } from '@/features/exploration/data/systems';
import {
  hyperspaceLaneProgress,
  projectHyperspaceLane,
} from '@/features/exploration/hyperspaceLane';
import { useExplorationStore } from '@/stores/explorationStore';

const start = 44;
const span = 392;
const axis = 66;

export function HyperspaceLaneMap({ onAbort }: { onAbort: () => void }) {
  const clipId = useId();
  const jump = useExplorationStore((state) => state.jump);
  const source = SYSTEMS.find((system) => system.id === jump.sourceId);
  const destination = SYSTEMS.find((system) => system.id === jump.destinationId);
  const systems = useMemo(
    () => (source && destination ? projectHyperspaceLane(source, destination, SYSTEMS) : null),
    [source, destination],
  );
  if (!source || !destination || !systems) return null;
  const progress = hyperspaceLaneProgress(jump.distanceTraveled, jump.distance);
  const shipX = start + progress * span;
  const held = jump.suspended || jump.waiting;
  const remaining = Math.max(0, Math.ceil(jump.remainingSeconds));
  const eta = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  const phase = held
    ? jump.suspended
      ? 'FLIGHT ON HOLD'
      : 'AWAITING CLEARANCE'
    : jump.phase === 'CHARGING'
      ? 'ALIGNING'
      : jump.phase === 'ACCELERATING'
        ? 'ENTERING LANE'
        : jump.phase === 'EXITING'
          ? 'ARRIVAL / DECELERATING'
          : 'IN TRANSIT';
  return (
    <section
      aria-label="Hyperspace lane map"
      className="pointer-events-auto absolute bottom-8 left-1/2 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 border-t border-instrument/70 bg-console/85 p-3 font-mono text-[11px] tablet:right-6 tablet:bottom-8 tablet:left-auto tablet:w-115 tablet:translate-x-0 tablet:p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[11px] tracking-[0.18em] text-instrument">
            HYPERSPACE LANE
          </h2>
          <p className="mt-1 truncate text-[9px] tracking-widest text-phosphor-dim">{phase}</p>
        </div>
        <button type="button" onClick={onAbort} className={instrumentButtonClassName}>
          Abort / Esc
        </button>
      </header>
      <svg
        viewBox="0 0 480 136"
        role="img"
        aria-label={`${source.name} to ${destination.name}. Kestrel at ${Math.round(progress * 100)} percent of the lane.`}
        className="my-1 h-22 w-full text-phosphor tablet:h-30"
      >
        <title>
          Live hyperspace lane from {source.name} to {destination.name}
        </title>
        <defs>
          <clipPath id={clipId}>
            <rect x="12" y="14" width="456" height="108" />
          </clipPath>
        </defs>
        <path
          d="M12 28v-14h22m412 0h22v14M12 108v14h22m412 0h22v-14"
          fill="none"
          stroke="currentColor"
          opacity="0.3"
        />
        <g fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.14">
          <path d="M16 34h448M16 66h448M16 98h448" />
          {[44, 142, 240, 338, 436].map((x) => (
            <path key={x} d={`M${x} 18v98`} />
          ))}
        </g>
        <g clipPath={`url(#${clipId})`} fill="none" stroke="currentColor" opacity="0.16">
          {[0.25, 0.5].map((fraction) => (
            <ellipse
              key={fraction}
              cx={shipX}
              cy={axis}
              rx={span * fraction}
              ry={span * fraction * 0.25}
            />
          ))}
        </g>
        {systems.map((system) => {
          if (system.id === source.id || system.id === destination.id) return null;
          const x = start + system.along * span;
          // Foreshorten lateral context in this oblique route projection.
          const y = axis - system.across * span * 0.25;
          if (x < 28 || x > 452 || y < 27 || y > 112 || Math.abs(y - axis) < 14) return null;
          return (
            <g key={system.id} opacity="0.6">
              <circle cx={x} cy={y} r="2" fill="currentColor" />
              <text
                x={x + (x > 240 ? -7 : 7)}
                y={y < axis ? y - 6 : y + 14}
                textAnchor={x > 240 ? 'end' : 'start'}
                fill="currentColor"
                fontSize="12"
              >
                {system.name.toUpperCase()}
              </text>
            </g>
          );
        })}
        <path
          d={`M${start} ${axis - 10}H${start + span}M${start} ${axis + 10}H${start + span}`}
          fill="none"
          stroke="currentColor"
          opacity="0.14"
        />
        <path
          d={`M${start} ${axis}H${start + span}`}
          stroke="currentColor"
          opacity="0.3"
          strokeDasharray="3 5"
        />
        <path
          d={`M${start} ${axis}H${shipX}`}
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.8"
        />
        {[0.25, 0.5, 0.75].map((fraction) => (
          <g key={fraction} opacity="0.45">
            <path d={`M${start + span * fraction} ${axis - 4}v8`} stroke="currentColor" />
            <text
              x={start + span * fraction}
              y={axis + 28}
              textAnchor="middle"
              fill="currentColor"
              fontSize="10"
            >
              {(jump.distance * fraction).toFixed(0)}
            </text>
          </g>
        ))}
        {[source, destination].map((system, index) => (
          <g key={system.id} className={index ? 'text-instrument' : 'text-phosphor'}>
            <circle
              cx={start + index * span}
              cy={axis}
              r="6"
              fill="var(--color-console)"
              stroke="currentColor"
            />
            <circle cx={start + index * span} cy={axis} r="2" fill="currentColor" />
            <text
              x={start + index * span}
              y={axis + 47}
              textAnchor={index ? 'end' : 'start'}
              fill="currentColor"
              fontSize="14"
              letterSpacing="1"
            >
              {system.name.toUpperCase()}
            </text>
          </g>
        ))}
        <g
          style={{ transform: `translate(${shipX}px, ${axis}px)` }}
          className={
            held
              ? 'text-instrument'
              : 'text-instrument transition-transform duration-100 ease-linear motion-reduce:transition-none'
          }
        >
          <path d="M0-22v10M0 12v10" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <circle
            r="10"
            fill="var(--color-console)"
            fillOpacity="0.85"
            stroke="currentColor"
            strokeOpacity="0.35"
          />
          <path d="m7 0-12-5 3 5-3 5Z" fill="currentColor" />
        </g>
      </svg>
      <footer className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-2 tabular-nums">
        <p className="text-phosphor">
          {jump.distanceTraveled.toFixed(1)}{' '}
          <span className="text-phosphor-dim">/ {jump.distance.toFixed(1)} LY</span>
        </p>
        <p className="text-instrument">
          {held ? 'HOLD' : eta}{' '}
          <span className="ml-1 text-[9px] text-phosphor-dim">TO ARRIVAL</span>
        </p>
      </footer>
      <progress aria-label="Lane distance traveled" value={progress} max={1} className="sr-only" />
    </section>
  );
}
