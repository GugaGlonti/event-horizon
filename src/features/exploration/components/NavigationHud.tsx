import { navigationContacts } from '@/engine/navigation/contacts';
import { bodyLabel, formatDistance } from '@/features/exploration/components/LocalSystemMap';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

export function NavigationHud({ session }: { session: FlightSession }) {
  const systemId = useExplorationStore((state) => state.systemId);
  const navigation = useExplorationStore((state) => state.navigation);
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);
  const target = (system ? navigationContacts(system) : []).find(
    (body) => body.id === navigation.targetId,
  );
  const nearest = (system ? navigationContacts(system) : []).find(
    (body) => body.id === navigation.nearestId,
  );
  return (
    <section
      aria-label="Navigation target"
      className="pointer-events-auto col-span-2 min-w-0 tablet:col-span-1 tablet:w-full tablet:max-w-88 tablet:justify-self-end"
    >
      <div className="mb-2 flex items-center gap-2 text-[10px] tracking-[0.16em] text-phosphor-dim">
        <span aria-hidden="true" className="h-px w-4 bg-phosphor/50" />
        <span>Navigation</span>
        <span className="ml-auto text-phosphor/60">{target ? 'TRACK' : 'FREE'}</span>
      </div>
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 100 100"
          className="size-16 shrink-0 text-phosphor/80 tablet:size-20"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="44" />
          <circle cx="50" cy="50" r="30" opacity="0.3" />
          <circle cx="50" cy="50" r="14" opacity="0.3" />
          <path d="M50 0v100M0 50h100M19 19l62 62M19 81l62-62" opacity="0.25" />
          <path d="m45 54 5-11 5 11-5-3Z" fill="currentColor" />
          {target && (
            <g
              transform={`translate(${50 + navigation.bearingX * 36} ${50 + navigation.bearingY * 36})`}
              className="text-instrument"
            >
              <path d="M-5-3v-2h3m4 0h3v2M5 3v2H2m-4 0h-3V3" strokeWidth="1.5" />
              <circle r="1.5" fill="currentColor" />
            </g>
          )}
        </svg>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => session.exploration.openMap('local')}
            aria-label="Choose navigation target"
            className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span className="block truncate text-base tracking-wider text-phosphor">
              {target?.name ?? 'No target'}
            </span>
            <span className="mt-1 block text-xs text-instrument">
              {target
                ? `${formatDistance(navigation.surfaceDistance)} / SURFACE`
                : 'L / SELECT CONTACT'}
            </span>
          </button>
          <p className="mt-2 text-[10px] leading-4 text-phosphor-dim">
            {target
              ? `${bodyLabel(target)} / ${navigation.behind ? 'ASTERN' : navigation.aligned ? 'ALIGNED' : 'OFF AXIS'}`
              : nearest
                ? `NEAR ${nearest.name}`
                : 'T / CYCLE CONTACTS'}
          </p>
        </div>
      </div>
    </section>
  );
}

export function NavigationMarker() {
  const systemId = useExplorationStore((state) => state.systemId);
  const navigation = useExplorationStore((state) => state.navigation);
  const markers = useExplorationStore((state) => state.planetMarkers);
  const overlay = useExplorationStore((state) => state.overlay);
  const flying = useFlightStore((state) => state.phase === 'flying');
  const target = SYSTEMS.find((system) => system.id === systemId)?.bodies.find(
    (body) => body.id === navigation.targetId,
  );
  if (
    !target ||
    (flying &&
      !overlay &&
      markers?.systemId === systemId &&
      markers.items.some((marker) => marker.id === target.id))
  )
    return null;
  return (
    <div
      aria-hidden="true"
      style={{
        left: `${50 + navigation.bearingX * 39}%`,
        top: `${44 + navigation.bearingY * 22}%`,
      }}
      className="absolute -translate-1/2 text-center text-instrument/90"
    >
      <span className="block text-2xl leading-none">{navigation.behind ? '‹' : '⌖'}</span>
      <span className="mt-1 block bg-console/70 px-1 text-[10px] tracking-wider">
        {target.name}
      </span>
    </div>
  );
}
