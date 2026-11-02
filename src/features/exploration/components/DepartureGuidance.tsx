import { InstrumentButton } from '@/components/ui/InstrumentButton';
import { formatDistance } from '@/features/exploration/components/LocalSystemMap';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

export function DepartureGuidance({ session }: { session: FlightSession }) {
  const departure = useExplorationStore((state) => state.departure);
  const overlay = useExplorationStore((state) => state.overlay);
  const flying = useFlightStore((state) => state.phase === 'flying');
  if (!departure || overlay || !flying) return null;
  const destination = SYSTEMS.find((system) => system.id === departure.destinationId);
  const x = 50 + departure.bearingX * 39;
  const y = 43 + departure.bearingY * 23;
  return (
    <>
      {!departure.ready && departure.waypoint && (
        <>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full text-instrument/50"
            aria-hidden="true"
          >
            <path
              d={`M50 43 L${x} ${y}`}
              stroke="currentColor"
              strokeWidth="0.12"
              strokeDasharray="0.5 1.2"
            />
          </svg>
          <div
            aria-hidden="true"
            style={{ left: `${x}%`, top: `${y}%` }}
            className="pointer-events-none absolute -translate-1/2 text-center text-instrument"
          >
            <span className="text-3xl">{departure.behind ? '↶' : '◇'}</span>
            <span className="block bg-console/80 px-1 text-[10px]">
              {departure.behind ? 'TURN TOWARD LANE' : 'LAUNCH WAYPOINT'}
            </span>
            <span className="block text-[10px]">{formatDistance(departure.distance)}</span>
          </div>
        </>
      )}
      <section
        aria-label="Hyperdrive departure guidance"
        className="pointer-events-auto absolute top-32 left-3 w-60 max-w-[calc(100%-24px)] border-l-2 border-instrument bg-console/90 p-3 text-[11px] tablet:top-28 tablet:left-6 tablet:w-72"
      >
        <p className="tracking-widest text-phosphor-dim">COURSE / {destination?.name}</p>
        <p role="status" className="mt-2 text-instrument">
          {departure.ready ? 'LAUNCH LANE CLEAR' : 'FLY TO LAUNCH WAYPOINT'}
        </p>
        <p className="mt-2 text-[10px] leading-4 normal-case text-phosphor-dim">
          {departure.ready
            ? 'Ready to jump. Confirm when you are ready.'
            : departure.waypoint
              ? `Clear ${departure.blockedBy}'s mass shadow · ${formatDistance(departure.distance)}. Follow the amber route; flight stays under your control.`
              : `Fly outward from ${departure.blockedBy}. A clear local route is being recalculated.`}
        </p>
        <div className="mt-3 flex gap-2">
          <InstrumentButton
            disabled={!departure.ready}
            primary
            onClick={session.exploration.beginJump}
            className="flex-1"
          >
            {departure.ready ? 'TAB / Engage' : 'Lane obstructed'}
          </InstrumentButton>
          <InstrumentButton
            onClick={session.exploration.cancelDeparture}
            aria-label="Cancel departure guidance"
          >
            Cancel
          </InstrumentButton>
        </div>
      </section>
    </>
  );
}
