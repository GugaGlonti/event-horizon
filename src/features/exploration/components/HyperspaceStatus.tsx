import { HYPERSPACE_TIMING, type JumpPhase } from '@/engine/navigation/HyperspaceController';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { flightButtonClassName } from '@/features/flight/components/FlightMenu';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

const labels: Record<JumpPhase, [string, string]> = {
  IDLE: ['Hyperdrive ready', ''],
  CHARGING: ['Charging hyperdrive', 'Bringing the stars within reach.'],
  ACCELERATING: ['Crossing the threshold', 'The familiar falls away.'],
  HYPERSPACE: ['Between the stars', 'Following a thread through the dark.'],
  EXITING: ['Returning to realspace', 'A new horizon is waiting.'],
  COOLDOWN: ['Hyperdrive cooling', ''],
};

export function HyperspaceStatus({ session }: { session: FlightSession }) {
  const jump = useExplorationStore((state) => state.jump);
  const arrival = useExplorationStore((state) => state.arrival);
  const destination = SYSTEMS.find((system) => system.id === jump.destinationId);
  const busy = jump.phase !== 'IDLE' && jump.phase !== 'COOLDOWN';
  if (!busy)
    return (
      <>
        {arrival && (
          <p
            role="status"
            className="absolute top-28 left-1/2 max-w-[80%] -translate-x-1/2 rounded border border-cyan-100/15 bg-[#07141be8] px-4 py-3 text-center text-xs text-cyan-100 tablet:top-24"
          >
            {arrival}
          </p>
        )}
        {jump.phase === 'COOLDOWN' && (
          <p className="absolute bottom-24 left-1/2 -translate-x-1/2 font-mono text-[8px] text-cyan-100/50">
            HYPERDRIVE COOLDOWN / {Math.ceil((1 - jump.progress) * HYPERSPACE_TIMING.COOLDOWN)}s
          </p>
        )}
      </>
    );
  return (
    <section
      aria-label="Hyperspace journey"
      className="pointer-events-auto absolute top-1/2 left-1/2 z-30 w-[min(88%,460px)] -translate-1/2 rounded-xl border border-cyan-100/15 bg-[#030d1bd9] px-6 py-8 text-center shadow-2xl backdrop-blur-sm"
    >
      <p className="font-mono text-[9px] tracking-[0.3em] text-cyan-100/60">
        FLIGHT PLAN / {destination?.name.toUpperCase()}
      </p>
      <h2
        role="status"
        className="mt-4 text-3xl font-light tracking-tight text-white tablet:text-4xl"
      >
        {jump.suspended ? 'Journey on hold.' : labels[jump.phase][0]}
      </h2>
      <p className="mt-3 text-xs text-cyan-100/60">
        {jump.suspended
          ? 'Flight is held after a focus or visibility change.'
          : labels[jump.phase][1]}
      </p>
      <progress
        aria-label={`${labels[jump.phase][0]} progress`}
        value={jump.progress}
        max={1}
        className="sr-only"
      />
      <div className="mx-auto mt-7 h-px w-48 overflow-hidden bg-cyan-100/15">
        <div
          className="h-full origin-left bg-cyan-100/80"
          style={{ transform: `scaleX(${jump.progress})` }}
        />
      </div>
      <p className="mt-3 font-mono text-[8px] tracking-[0.2em] text-cyan-100/50">
        {jump.phase} / {Math.round(jump.progress * 100)}%
      </p>
      <div className="mt-7 flex justify-center gap-2">
        {jump.suspended && (
          <button
            type="button"
            onClick={session.exploration.resumeJourney}
            className={`${flightButtonClassName} bg-cyan-100/10 text-cyan-100`}
          >
            Resume journey
          </button>
        )}
        <button
          type="button"
          onClick={() => session.exploration.cancelJump()}
          className={`${flightButtonClassName} bg-[#05101cc0]`}
        >
          Abort jump <kbd className="ml-2 text-slate-500">ESC</kbd>
        </button>
      </div>
    </section>
  );
}
