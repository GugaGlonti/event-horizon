import { formatDistance } from '@/features/exploration/components/LocalSystemMap';
import { PLANET_MARKER_SIZE } from '@/features/exploration/planetMarkers';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

export function NearbyPlanetMarkers() {
  const markers = useExplorationStore((state) => state.planetMarkers);
  const systemId = useExplorationStore((state) => state.systemId);
  const targetId = useExplorationStore((state) => state.navigation.targetId);
  const overlay = useExplorationStore((state) => state.overlay);
  const phase = useExplorationStore((state) => state.jump.phase);
  const flying = useFlightStore((state) => state.phase === 'flying');
  if (
    !flying ||
    overlay ||
    (phase !== 'IDLE' && phase !== 'COOLDOWN') ||
    markers?.systemId !== systemId ||
    !markers.items.length
  )
    return null;
  return (
    <ul
      aria-label="Nearby planets"
      className="pointer-events-none absolute inset-0 m-0 list-none p-0"
    >
      {markers.items.map((marker) => (
        <li
          key={marker.id}
          aria-label={`${marker.name}, ${formatDistance(marker.surfaceDistance)} to surface${marker.behind ? ', behind you' : ''}`}
          style={{
            left: marker.x,
            top: marker.y,
            width: PLANET_MARKER_SIZE.width,
            height: PLANET_MARKER_SIZE.height,
          }}
          className={`absolute flex -translate-1/2 items-center gap-2 px-2 font-mono [text-shadow:none] ${marker.id === targetId ? 'text-instrument/80' : 'text-phosphor/65'} ${marker.edge === 'right' ? 'flex-row-reverse text-right' : ''}`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-3.5 shrink-0"
            style={{ transform: `rotate(${marker.angle}deg)` }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          >
            <path d="m5 3 5 5-5 5" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] tracking-wider">{marker.name}</span>
            <span className="block whitespace-nowrap text-[10px] opacity-80">
              {formatDistance(marker.surfaceDistance)}
              {marker.behind && ' / AFT'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
