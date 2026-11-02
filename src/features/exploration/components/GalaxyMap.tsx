import { InstrumentButton, instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import { HYPERSPACE_TIMING, hyperspaceDuration } from '@/engine/navigation/HyperspaceController';
import { travelDistance } from '@/engine/navigation/hyperspaceRoute';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

const chartStars = Array.from({ length: 90 }, (_, index) => ({
  x: (index * 137 + 59) % 1000,
  y: (index * 197 + 37) % 600,
  r: index % 7 === 0 ? 1.4 : 0.6,
}));

export function GalaxyMap({ session }: { session: FlightSession }) {
  const current = useExplorationStore((state) => state.systemId);
  const selectedId = useExplorationStore((state) => state.destinationId);
  const jump = useExplorationStore((state) => state.jump);
  const error = useExplorationStore((state) => state.error);
  const sound = useExplorationStore((state) => state.soundEnabled);
  const ready = useFlightStore((state) => state.rendererReady);
  const selected = SYSTEMS.find((system) => system.id === selectedId);
  const currentSystem = SYSTEMS.find((system) => system.id === current);
  const distance = selected && currentSystem ? travelDistance(currentSystem, selected) : 0;
  const seconds =
    HYPERSPACE_TIMING.ALIGNMENT +
    HYPERSPACE_TIMING.ACCELERATING +
    hyperspaceDuration(distance) +
    HYPERSPACE_TIMING.EXITING;
  const unavailable = !selected
    ? 'Select a star system to plot your jump.'
    : selected.id === current
      ? 'You are already in this system.'
      : jump.phase !== 'IDLE'
        ? 'Hyperdrive cooling down. Flight remains available.'
        : !ready
          ? 'Preparing the flight deck…'
          : null;
  const exploration = session.exploration;
  return (
    <div className="grid grid-cols-1 tablet:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="min-w-0 border-b border-line p-5 tablet:border-r tablet:border-b-0 tablet:p-8">
        <div className="flex justify-between gap-4 font-mono text-[10px] tracking-widest text-phosphor-dim">
          <span>SECTOR 07 / OUTER REACHES</span>
          <span>{SYSTEMS.length.toString().padStart(2, '0')} SYSTEMS</span>
        </div>
        <div className="relative mt-4 aspect-5/3 min-h-56 w-full overflow-hidden border border-line crt-grid bg-[#030905]">
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            aria-hidden="true"
          >
            <defs>
              <pattern id="chart-grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <path
                  d="M 100 0 L 0 0 0 100"
                  fill="none"
                  stroke="#73f59b"
                  strokeOpacity="0.14"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#chart-grid)" />
            <ellipse
              cx="500"
              cy="300"
              rx="380"
              ry="200"
              fill="none"
              stroke="#73f59b"
              strokeOpacity="0.22"
              strokeDasharray="3 10"
            />
            {chartStars.map((star) => (
              <circle
                key={star.x}
                cx={star.x}
                cy={star.y}
                r={star.r}
                fill="#73f59b"
                opacity="0.45"
              />
            ))}
            <path
              d={`M${SYSTEMS.map((system) => `${system.chartPosition[0] * 10} ${system.chartPosition[1] * 6}`).join('L')}`}
              fill="none"
              stroke="#73f59b"
              strokeOpacity="0.3"
              strokeDasharray="4 8"
            />
            {selected && selected.id !== current && currentSystem && (
              <line
                x1={currentSystem.chartPosition[0] * 10}
                y1={currentSystem.chartPosition[1] * 6}
                x2={selected.chartPosition[0] * 10}
                y2={selected.chartPosition[1] * 6}
                stroke="#ffbd66"
                strokeOpacity="0.6"
                strokeDasharray="5 6"
              />
            )}
          </svg>
          {SYSTEMS.map((system) => (
            <button
              key={system.id}
              type="button"
              aria-label={`Chart ${system.name}`}
              aria-pressed={selectedId === system.id}
              onClick={() => exploration.selectDestination(system.id)}
              style={{
                left: `${system.chartPosition[0]}%`,
                top: `${system.chartPosition[1]}%`,
              }}
              className="absolute grid size-8 tablet:size-10 -translate-1/2 cursor-pointer place-items-center border border-phosphor/50 bg-console text-phosphor outline-none transition-colors hover:border-phosphor focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus motion-reduce:transition-none aria-pressed:border-instrument aria-pressed:text-instrument"
            >
              <svg
                viewBox="0 0 40 40"
                className="size-6 tablet:size-8"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <circle cx="20" cy="20" r="10" />
                <ellipse cx="20" cy="20" rx="4" ry="10" />
                <path d="M10 20h20M20 2v5m0 26v5M2 20h5m26 0h5" />
              </svg>
              <span className="absolute top-full mt-1 whitespace-nowrap font-mono text-[9px] tablet:text-[11px] tracking-widest">
                {system.name}
              </span>
              {current === system.id && (
                <span className="absolute bottom-full mb-2 whitespace-nowrap font-mono text-[10px] tracking-widest text-phosphor-dim">
                  YOU ARE HERE
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-phosphor-dim">
          Interstellar chart / Select a system to plot a course.
        </p>
        <div className="mt-5 grid gap-2">
          {SYSTEMS.map((system) => (
            <button
              key={system.id}
              type="button"
              aria-label={`Select ${system.name}`}
              aria-pressed={selectedId === system.id}
              onClick={() => exploration.selectDestination(system.id)}
              className="flex cursor-pointer items-center justify-between gap-4 border border-line px-4 py-3 text-left text-xs text-phosphor-dim transition-colors hover:border-phosphor/60 focus-visible:outline-2 focus-visible:outline-focus aria-pressed:border-phosphor aria-pressed:bg-phosphor/10 aria-pressed:text-phosphor motion-reduce:transition-none"
            >
              <span>{system.name}</span>
              <span className="font-mono text-[11px] tracking-widest text-phosphor-dim">
                {current === system.id ? 'CURRENT' : system.civilization?.replaceAll('_', ' ')}
              </span>
            </button>
          ))}
        </div>
      </div>
      <aside className="flex min-w-0 flex-col p-5 tablet:p-8" aria-label="Destination information">
        <p className="font-mono text-[10px] tracking-[0.2em] text-phosphor-dim">
          DESTINATION / FLIGHT PLAN
        </p>
        <h3 className="mt-5 text-4xl font-bold tracking-[0.06em]">
          {selected?.name ?? 'No course set'}
        </h3>
        <p className="mt-4 text-xs leading-6 normal-case text-phosphor-dim">
          {selected?.description ??
            'Choose a system from the chart or catalogue to load destination data and prepare the hyperdrive.'}
        </p>
        {selected && (
          <dl className="mt-6 grid grid-cols-2 gap-5 border-y border-line py-5 text-xs">
            <div>
              <dt className="text-[10px] text-phosphor-dim">ROUTE DISTANCE</dt>
              <dd className="mt-2 text-instrument">{distance.toFixed(1)} LY</dd>
            </div>
            <div>
              <dt className="text-[10px] text-phosphor-dim">ESTIMATED JUMP</dt>
              <dd className="mt-2 text-instrument">
                {distance > 0 ? `${Math.ceil(seconds)} SEC` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-phosphor-dim">WORLDS</dt>
              <dd className="mt-2 text-3xl text-instrument">
                {
                  selected.bodies.filter((body) => body.kind !== 'star' && body.kind !== 'moon')
                    .length
                }
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-phosphor-dim">MOONS</dt>
              <dd className="mt-2 text-3xl text-instrument">
                {selected.bodies.filter((body) => body.kind === 'moon').length}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] text-phosphor-dim">CIVILIZATION / POINTS OF INTEREST</dt>
              <dd className="mt-2 text-xs leading-6">
                {selected.civilization?.replaceAll('_', ' ')} ·{' '}
                {selected.bodies.flatMap((b) => b.settlements ?? []).length} settlements
              </dd>
              <dd className="mt-2 text-xs leading-6 normal-case text-phosphor-dim">
                {selected.bodies
                  .flatMap((b) =>
                    (b.settlements ?? []).filter((c) => c.kind === 'capital').map((c) => c.name),
                  )
                  .concat(
                    (selected.stations ?? [])
                      .filter((s) => s.type !== 'surface')
                      .map((s) => s.name),
                  )
                  .join(' / ') || 'Uninhabited survey worlds'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] text-phosphor-dim">ARRIVAL ANCHOR</dt>
              <dd className="mt-2 text-phosphor">
                {
                  selected.bodies.find(
                    (body) =>
                      body.id ===
                      selected.spawns.find((spawn) => spawn.id === selected.arrivalId)?.bodyId,
                  )?.name
                }{' '}
                approach
              </dd>
            </div>
          </dl>
        )}
        <div className="mt-8 tablet:mt-auto tablet:pt-8">
          <InstrumentButton
            primary
            disabled={Boolean(unavailable)}
            onClick={exploration.beginJump}
            className="w-full py-3.5"
          >
            Engage hyperdrive{' '}
            <span aria-hidden="true" className="ml-3">
              ↗
            </span>
          </InstrumentButton>
          <p className="mt-3 min-h-8 text-[11px] leading-relaxed normal-case text-phosphor-dim">
            {unavailable ??
              'Course available. Engage to align, accelerate, and jump. Keyboard flight returns on arrival.'}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-xs text-instrument">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={exploration.toggleSound}
            aria-pressed={sound}
            className={`${instrumentButtonClassName} mt-4 w-full`}
          >
            Jump audio {sound ? 'on' : 'off'}
          </button>
        </div>
      </aside>
    </div>
  );
}
