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
  const x = 50 + departure.bearingX * 16;
  const y = 43 + departure.bearingY * 12;
  const turn =
    Math.abs(departure.bearingX) + Math.abs(departure.bearingY) < 0.02
      ? 0
      : (Math.atan2(departure.bearingX, -departure.bearingY) * 180) / Math.PI;
  return (
    <>
      {!departure.ready && departure.waypoint && (
        <>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 hidden size-full text-instrument/50 min-[1100px]:block"
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
            className="pointer-events-none absolute hidden -translate-1/2 text-center text-instrument min-[1100px]:block"
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
        className="pointer-events-auto absolute inset-x-3 top-28 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-l-2 border-instrument bg-console/90 p-3 text-[10px] min-[1100px]:right-auto min-[1100px]:left-1/2 min-[1100px]:block min-[1100px]:w-80 min-[1100px]:-translate-x-1/2 min-[1100px]:text-[11px]"
      >
        <div className="min-w-0">
          <p className="truncate text-phosphor-dim min-[1100px]:tracking-widest">
            <span className="hidden min-[1100px]:inline">COURSE / </span>
            {destination?.name}
            {!departure.ready && departure.waypoint && (
              <span className="min-[1100px]:hidden"> / {formatDistance(departure.distance)}</span>
            )}
          </p>
          <p role="status" className="mt-1 text-instrument">
            {!departure.ready && departure.waypoint && (
              <span
                aria-hidden="true"
                className="mr-1 inline-block"
                style={{ transform: departure.behind ? undefined : `rotate(${turn}deg)` }}
              >
                {departure.behind ? '↶' : '↑'}
              </span>
            )}
            {departure.ready
              ? 'LAUNCH LANE CLEAR'
              : !departure.waypoint
                ? 'FLY CLEAR / RECALCULATING'
                : departure.behind
                  ? 'TURN TOWARD LANE'
                  : 'FOLLOW AMBER ROUTE'}
          </p>
          <p className="sr-only min-[1100px]:not-sr-only min-[1100px]:mt-2 min-[1100px]:text-[10px] min-[1100px]:leading-4 min-[1100px]:normal-case min-[1100px]:text-phosphor-dim">
            {departure.ready
              ? 'Ready to jump. Confirm when you are ready.'
              : departure.waypoint
                ? `Clear ${departure.blockedBy}'s mass shadow · ${formatDistance(departure.distance)}. Follow the amber route; flight stays under your control.`
                : `Fly outward from ${departure.blockedBy}. A clear local route is being recalculated.`}
          </p>
        </div>
        <div className="flex gap-2 min-[1100px]:mt-3">
          <InstrumentButton
            disabled={!departure.ready}
            primary={departure.ready}
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
