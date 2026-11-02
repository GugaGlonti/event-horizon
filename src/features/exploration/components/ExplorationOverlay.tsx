import { GalaxyMap } from '@/features/exploration/components/GalaxyMap';
import { LocalSystemMap } from '@/features/exploration/components/LocalSystemMap';
import { MapDialog } from '@/features/exploration/components/MapDialog';
import { PlanetaryMap } from '@/features/exploration/components/PlanetaryMap';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function ExplorationOverlay({ session }: { session: FlightSession }) {
  const overlay = useExplorationStore((state) => state.overlay);
  if (!overlay) return null;
  return (
    <MapDialog key={overlay} view={overlay} exploration={session.exploration}>
      {overlay === 'galaxy' ? (
        <GalaxyMap session={session} />
      ) : overlay === 'planetary' ? (
        <PlanetaryMap session={session} />
      ) : (
        <LocalSystemMap session={session} />
      )}
    </MapDialog>
  );
}
