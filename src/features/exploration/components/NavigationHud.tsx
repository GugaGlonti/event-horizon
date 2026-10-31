import { bodyLabel, formatDistance } from '@/features/exploration/components/LocalSystemMap';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function NavigationHud({ session }: { session: FlightSession }) {
  const systemId = useExplorationStore((state) => state.systemId);
  const navigation = useExplorationStore((state) => state.navigation);
  const phase = useExplorationStore((state) => state.jump.phase);
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);
  const target = system?.bodies.find((body) => body.id === navigation.targetId);
  const nearest = system?.bodies.find((body) => body.id === navigation.nearestId);
  const busy = phase !== 'IDLE' && phase !== 'COOLDOWN';
  if (busy) return null;
  return (
    <>
      <section
        aria-label="Navigation target"
        className="pointer-events-auto absolute top-40 left-5 max-w-52 tablet:top-28 tablet:left-10"
      >
        <p className="font-mono text-[8px] tracking-[0.18em] text-cyan-200/45">
          {target ? 'TRACKING / LOCAL CONTACT' : 'NAVIGATION / FREE FLIGHT'}
        </p>
        <button
          type="button"
          onClick={() => session.exploration.openMap('local')}
          aria-label="Choose navigation target"
          className="mt-2 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
        >
          <span className="block text-lg font-light text-stone-200">
            {target?.name ?? 'Choose a destination'}
          </span>
          <span className="mt-1 block font-mono text-[9px] text-slate-400">
            {target
              ? `${bodyLabel(target)} · ${formatDistance(navigation.surfaceDistance)} to surface`
              : 'L · Open local system map'}
          </span>
        </button>
        <p className="mt-3 font-mono text-[8px] leading-4 text-slate-500">
          {target
            ? navigation.behind
              ? 'TARGET BEHIND / TURN TO ACQUIRE'
              : navigation.aligned
                ? 'COURSE ALIGNED'
                : 'ADJUST COURSE TO TARGET'
            : nearest
              ? `NEAR ${nearest.name.toUpperCase()} / ${formatDistance(navigation.nearestDistance)}`
              : 'T · Cycle contacts'}
        </p>
      </section>
      {target && (
        <div
          aria-hidden="true"
          style={{
            left: `${50 + navigation.bearingX * 40}%`,
            top: `${47 + navigation.bearingY * 26}%`,
          }}
          className="absolute -translate-1/2 text-center text-cyan-100/60"
        >
          <span className="block text-xl leading-none">{navigation.behind ? '‹' : '◇'}</span>
          <span className="mt-1 block font-mono text-[8px] tracking-wider">{target.name}</span>
        </div>
      )}
    </>
  );
}
