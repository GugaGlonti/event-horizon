import { HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { flightButtonClassName } from '@/features/flight/components/FlightMenu';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function HyperspaceStatus({ session }: { session: FlightSession }) {
  const jump = useExplorationStore((state) => state.jump);
  const arrival = useExplorationStore((state) => state.arrival);
  const destination = SYSTEMS.find((system) => system.id === jump.destinationId);
  const busy = jump.phase !== 'IDLE' && jump.phase !== 'COOLDOWN';
  if (busy && jump.suspended)
    return (
      <section
        aria-label="Journey on hold"
        className="pointer-events-auto absolute top-1/2 left-1/2 z-30 w-[min(88%,340px)] -translate-1/2 rounded-lg border border-cyan-100/15 bg-[#07131cf2] p-6 text-center shadow-xl"
      >
        <h2 role="status" className="text-xl font-light text-white">
          Journey on hold.
        </h2>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Resume when you return to the flight deck.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={session.exploration.resumeJourney}
            className={flightButtonClassName}
          >
            Resume journey
          </button>
          <button
            type="button"
            onClick={() => session.exploration.cancelJump()}
            className={flightButtonClassName}
          >
            Abort jump
          </button>
        </div>
      </section>
    );
  return (
    <>
      {busy && (
        <p role="status" className="sr-only">
          {jump.phase === 'CHARGING'
            ? `Aligning for ${destination?.name}. Hyperdrive charging.`
            : jump.phase === 'EXITING'
              ? `Arriving in ${destination?.name}.`
              : jump.phase === 'ACCELERATING'
                ? `Entering hyperspace for ${destination?.name}.`
                : `Travelling to ${destination?.name} through hyperspace.`}
        </p>
      )}
      {jump.phase === 'CHARGING' && (
        <section
          aria-label="Hyperdrive status"
          className="absolute top-44 left-5 w-56 border-l border-cyan-100/30 bg-gradient-to-r from-[#07131cb3] to-transparent py-2 pl-3 tablet:top-28 tablet:left-10"
        >
          <p className="font-mono text-[8px] tracking-[0.2em] text-cyan-100/55">
            COURSE / {destination?.name.toUpperCase()}
          </p>
          <p className="mt-2 text-xs font-light text-cyan-50">
            {jump.progress < 0.88 ? 'Aligning · hyperdrive charging' : 'Course locked · stand by'}
          </p>
          <progress
            aria-label="Hyperdrive charge"
            value={jump.progress}
            max={1}
            className="sr-only"
          />
          <div aria-hidden="true" className="mt-3 h-px w-36 bg-cyan-100/10">
            <div
              className="h-full origin-left bg-cyan-100/60"
              style={{ transform: `scaleX(${jump.progress})` }}
            />
          </div>
        </section>
      )}
      {arrival && (
        <p
          role="status"
          className="absolute bottom-48 left-1/2 w-max max-w-[80%] -translate-x-1/2 rounded border border-cyan-100/10 bg-[#07141bd9] px-3 py-2 text-center font-mono text-[9px] text-cyan-100 tablet:bottom-28"
        >
          {arrival}
        </p>
      )}
      {jump.phase === 'COOLDOWN' && !arrival && (
        <p className="absolute bottom-48 left-1/2 -translate-x-1/2 font-mono text-[8px] text-cyan-100/40 tablet:bottom-24">
          HYPERDRIVE / {Math.ceil((1 - jump.progress) * HYPERSPACE_TIMING.COOLDOWN)}s
        </p>
      )}
    </>
  );
}
