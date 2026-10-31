import { SYSTEMS } from '@/features/exploration/data/systems';
import { flightButtonClassName } from '@/features/flight/components/FlightMenu';
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
      <div className="min-w-0 border-b border-white/5 p-5 tablet:border-r tablet:border-b-0 tablet:p-8">
        <div className="flex justify-between gap-4 font-mono text-[9px] tracking-widest text-slate-500">
          <span>SECTOR 07 / OUTER REACHES</span>
          <span>{SYSTEMS.length.toString().padStart(2, '0')} SYSTEMS</span>
        </div>
        <div className="relative mt-4 aspect-5/3 min-h-56 w-full overflow-hidden rounded-lg border border-cyan-100/8 bg-[#030a15]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_55%_50%,#17405c50,transparent_65%)]" />
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
                  stroke="#9ed9ed"
                  strokeOpacity="0.045"
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
              stroke="#9ed9ed"
              strokeOpacity="0.09"
              strokeDasharray="3 10"
            />
            {chartStars.map((star) => (
              <circle
                key={star.x}
                cx={star.x}
                cy={star.y}
                r={star.r}
                fill="#b8d7e8"
                opacity="0.45"
              />
            ))}
            <path
              d={`M${SYSTEMS.map((system) => `${system.chartPosition[0] * 10} ${system.chartPosition[1] * 6}`).join('L')}`}
              fill="none"
              stroke="#8de8ec"
              strokeOpacity="0.12"
              strokeDasharray="4 8"
            />
            {selected && selected.id !== current && currentSystem && (
              <line
                x1={currentSystem.chartPosition[0] * 10}
                y1={currentSystem.chartPosition[1] * 6}
                x2={selected.chartPosition[0] * 10}
                y2={selected.chartPosition[1] * 6}
                stroke="#a0edff"
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
                color: system.environment.accent,
              }}
              className="absolute grid size-14 -translate-1/2 cursor-pointer place-items-center rounded-full border border-current/20 bg-current/5 outline-none transition-colors hover:border-current/70 focus-visible:ring-2 focus-visible:ring-current motion-reduce:transition-none aria-pressed:border-current aria-pressed:bg-current/15"
            >
              <span className="size-2 rounded-full bg-current shadow-[0_0_22px_currentColor]" />
              <span className="absolute top-full mt-2 whitespace-nowrap font-mono text-[10px] tracking-widest">
                {system.name}
              </span>
              {current === system.id && (
                <span className="absolute bottom-full mb-2 whitespace-nowrap font-mono text-[7px] tracking-widest text-slate-400">
                  YOU ARE HERE
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
          A few lights in a very large sky. Select a system to prepare the hyperdrive.
        </p>
        <div className="mt-5 grid gap-2">
          {SYSTEMS.map((system) => (
            <button
              key={system.id}
              type="button"
              aria-label={`Select ${system.name}`}
              aria-pressed={selectedId === system.id}
              onClick={() => exploration.selectDestination(system.id)}
              className="flex cursor-pointer items-center justify-between gap-4 rounded border border-white/8 px-4 py-3 text-left text-xs text-slate-400 transition-colors hover:border-cyan-100/25 focus-visible:outline-2 focus-visible:outline-cyan-100 aria-pressed:border-cyan-100/30 aria-pressed:bg-cyan-100/5 aria-pressed:text-cyan-100 motion-reduce:transition-none"
            >
              <span>{system.name}</span>
              <span className="font-mono text-[8px] tracking-widest text-slate-500">
                {current === system.id ? 'CURRENT SYSTEM' : 'JUMP AVAILABLE'}
              </span>
            </button>
          ))}
        </div>
      </div>
      <aside className="flex min-w-0 flex-col p-5 tablet:p-8" aria-label="Destination information">
        <p className="font-mono text-[9px] tracking-[0.2em] text-cyan-200/50">
          DESTINATION / FLIGHT PLAN
        </p>
        <h3 className="mt-5 text-4xl font-light tracking-tight">
          {selected?.name ?? 'Beyond the familiar.'}
        </h3>
        <p className="mt-4 text-xs leading-6 text-slate-400">
          {selected?.description ??
            'Choose a destination on the chart. Your journey starts with a single point of light.'}
        </p>
        {selected && (
          <dl className="mt-6 grid grid-cols-2 gap-5 border-y border-white/8 py-5 text-xs">
            <div>
              <dt className="text-[9px] text-slate-500">WORLDS</dt>
              <dd className="mt-2 text-lg text-stone-200">
                {
                  selected.bodies.filter((body) => body.kind !== 'star' && body.kind !== 'moon')
                    .length
                }
              </dd>
            </div>
            <div>
              <dt className="text-[9px] text-slate-500">MOONS</dt>
              <dd className="mt-2 text-lg text-stone-200">
                {selected.bodies.filter((body) => body.kind === 'moon').length}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[9px] text-slate-500">ARRIVAL ANCHOR</dt>
              <dd className="mt-2 text-stone-300">
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
          <button
            type="button"
            disabled={Boolean(unavailable)}
            onClick={exploration.beginJump}
            className="w-full cursor-pointer rounded border border-cyan-100/35 bg-cyan-100/10 px-5 py-3.5 text-xs text-cyan-50 transition-colors hover:bg-cyan-100/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/3 disabled:text-slate-500 motion-reduce:transition-none"
          >
            Engage hyperdrive{' '}
            <span aria-hidden="true" className="ml-3">
              ↗
            </span>
          </button>
          <p className="mt-3 min-h-8 text-[10px] leading-relaxed text-slate-500">
            {unavailable ??
              'Charge, accelerate, and cross the dark. You will arrive at a safe approach, with keyboard flight restored.'}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-xs text-amber-200">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={exploration.toggleSound}
            aria-pressed={sound}
            className={`${flightButtonClassName} mt-4 w-full`}
          >
            Jump audio {sound ? 'on' : 'off'}
          </button>
        </div>
      </aside>
    </div>
  );
}
