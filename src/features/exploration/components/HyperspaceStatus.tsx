import { instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import { HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import { DepartureGuidance } from '@/features/exploration/components/DepartureGuidance';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function HyperspaceStatus({ session }: { session: FlightSession }) {
  const jump = useExplorationStore((state) => state.jump);
  const arrival = useExplorationStore((state) => state.arrival);
  const destination = SYSTEMS.find((system) => system.id === jump.destinationId);
  const source = SYSTEMS.find((system) => system.id === jump.sourceId);
  const remaining = Math.max(0, Math.ceil(jump.remainingSeconds));
  const eta = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  const busy = jump.phase !== 'IDLE' && jump.phase !== 'COOLDOWN';
  if (busy && jump.suspended)
    return (
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
    );
  return (
    <>
      <DepartureGuidance session={session} />
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
      {busy && (
        <section
          aria-label="Hyperspace telemetry"
          className="pointer-events-auto absolute bottom-8 left-1/2 w-[calc(100%-24px)] max-w-2xl -translate-x-1/2 border-t border-instrument/70 bg-console/85 p-3 text-[11px] tablet:bottom-10 tablet:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="tracking-[0.2em] text-instrument">
                {jump.waiting
                  ? 'AWAITING ARRIVAL CLEARANCE'
                  : jump.phase === 'CHARGING'
                    ? 'HYPERDRIVE / ALIGNING'
                    : jump.phase === 'ACCELERATING'
                      ? 'HYPERDRIVE / STAR STRETCH'
                      : jump.phase === 'EXITING'
                        ? 'HYPERDRIVE / ARRIVAL'
                        : 'HYPERSPACE / IN TRANSIT'}
              </p>
              <p className="mt-1 truncate text-[10px] text-phosphor-dim">
                {source?.name.toUpperCase()} → {destination?.name.toUpperCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => session.exploration.cancelJump()}
              className={instrumentButtonClassName}
            >
              Abort / Esc
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 tabular-nums">
            <div>
              <dt className="text-[9px] tracking-wider text-phosphor-dim">DISTANCE / LY</dt>
              <dd className="mt-1 text-sm text-phosphor tablet:text-xl">
                {jump.distanceTraveled.toFixed(1)}{' '}
                <span className="text-[10px] text-phosphor-dim">/ {jump.distance.toFixed(1)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[9px] tracking-wider text-phosphor-dim">EST. REMAINING</dt>
              <dd className="mt-1 text-sm text-phosphor tablet:text-xl">
                {jump.waiting ? 'HOLD' : eta}
              </dd>
            </div>
            <div>
              <dt className="text-[9px] tracking-wider text-phosphor-dim">FLIGHT TIME / S</dt>
              <dd className="mt-1 text-sm text-phosphor tablet:text-xl">
                {jump.elapsedSeconds.toFixed(1)}
              </dd>
            </div>
          </dl>
          <progress
            aria-label="Jump progress"
            value={jump.elapsedSeconds}
            max={jump.totalSeconds || 1}
            className="sr-only"
          />
          <div aria-hidden="true" className="mt-3 h-1 overflow-hidden bg-phosphor/15">
            <div
              className="h-full origin-left bg-instrument"
              style={{
                transform: `scaleX(${jump.totalSeconds ? jump.elapsedSeconds / jump.totalSeconds : 0})`,
              }}
            />
          </div>
          <p className="mt-2 text-[9px] tracking-wider text-phosphor-dim">
            {jump.waiting
              ? 'HOLDING POSITION · ETA RESUMES WITH CLEARANCE'
              : jump.phase === 'CHARGING'
                ? `COURSE ALIGNMENT ${Math.round(jump.progress * 100)}% · STABILIZERS ENGAGED`
                : jump.phase === 'EXITING'
                  ? 'DECELERATING · LOCAL FLIGHT RESTORES ON ARRIVAL'
                  : 'COURSE LOCKED · STABILIZERS ENGAGED'}
          </p>
        </section>
      )}
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
