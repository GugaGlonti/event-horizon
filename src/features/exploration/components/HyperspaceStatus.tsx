import { instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import { HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import { DepartureGuidance } from '@/features/exploration/components/DepartureGuidance';
import { HyperspaceLaneMap } from '@/features/exploration/components/HyperspaceLaneMap';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function HyperspaceStatus({ session }: { session: FlightSession }) {
  const jump = useExplorationStore((state) => state.jump);
  const arrival = useExplorationStore((state) => state.arrival);
  const destination = SYSTEMS.find((system) => system.id === jump.destinationId);
  const busy = jump.phase !== 'IDLE' && jump.phase !== 'COOLDOWN';
  return (
    <>
      {busy && jump.suspended && (
        <section
          aria-label="Journey on hold"
          className="pointer-events-auto absolute top-1/2 left-1/2 z-30 w-[min(92%,400px)] -translate-1/2 border border-instrument/65 bg-console p-6 text-center"
        >
          <h2 role="status" className="text-xl font-bold text-phosphor">
            Journey on hold.
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-phosphor-dim">
            Resume when you return to the flight deck.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={session.exploration.resumeJourney}
              className={instrumentButtonClassName}
            >
              Resume journey
            </button>
            <button
              type="button"
              onClick={() => session.exploration.cancelJump()}
              className={instrumentButtonClassName}
            >
              Abort jump
            </button>
          </div>
        </section>
      )}
      <DepartureGuidance session={session} />
      {busy && !jump.suspended && (
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
      {busy && <HyperspaceLaneMap onAbort={() => session.exploration.cancelJump()} />}
      {arrival && (
        <p
          role="status"
          className="absolute bottom-80 left-1/2 w-max max-w-[90%] -translate-x-1/2 border border-phosphor/60 bg-console/95 px-3 py-2 text-center font-mono text-[11px] text-phosphor tablet:bottom-56"
        >
          {arrival}
        </p>
      )}
      {jump.phase === 'COOLDOWN' && !arrival && (
        <p className="absolute bottom-80 left-1/2 -translate-x-1/2 bg-console/85 px-3 py-2 font-mono text-[11px] text-phosphor-dim tablet:bottom-56">
          HYPERDRIVE / {Math.ceil((1 - jump.progress) * HYPERSPACE_TIMING.COOLDOWN)}s
        </p>
      )}
    </>
  );
}
