import type { CelestialDefinition, Position3 } from '@/engine/world/worldTypes';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { flightButtonClassName } from '@/features/flight/components/FlightMenu';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}
export function bodyLabel(body: CelestialDefinition) {
  return body.kind === 'gas-giant'
    ? 'Gas giant'
    : body.kind === 'rocky'
      ? 'Planet'
      : body.kind === 'star'
        ? 'Star'
        : 'Moon';
}

export function LocalSystemMap({ session }: { session: FlightSession }) {
  const systemId = useExplorationStore((state) => state.systemId);
  const chart = useExplorationStore((state) => state.chart);
  const targetId = useExplorationStore((state) => state.navigation.targetId);
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);
  if (!system) return null;
  const range =
    Math.max(1, ...chart.bodies.map((body) => Math.hypot(body.position[0], body.position[2]))) *
    1.2;
  const project = (position: Position3) =>
    [50 + (position[0] / range) * 42, 50 + (position[2] / range) * 42] as const;
  const marker = (body: CelestialDefinition) => {
    const position = chart.bodies.find((candidate) => candidate.id === body.id)?.position ?? [
      0, 0, 0,
    ];
    const direct = project(position);
    if (body.kind !== 'moon') return direct;
    const parent = chart.bodies.find((candidate) => candidate.id === body.parentId)?.position ?? [
      0, 0, 0,
    ];
    const base = project(parent);
    const dx = position[0] - parent[0],
      dz = position[2] - parent[2];
    const length = Math.max(1, Math.hypot(dx, dz));
    return [base[0] + (dx / length) * 7, base[1] + (dz / length) * 7] as const;
  };
  const player = project(chart.ship);
  return (
    <div className="grid grid-cols-1 tablet:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="border-b border-white/5 p-5 tablet:border-r tablet:border-b-0 tablet:p-8">
        <div className="flex justify-between font-mono text-[9px] tracking-widest text-slate-500">
          <span>{system.name.toUpperCase()} / LOCAL CHART</span>
          <span>{system.bodies.length} CONTACTS</span>
        </div>
        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[440px] overflow-hidden rounded-lg border border-cyan-100/8 bg-[#030a15]">
          <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <radialGradient id="system-glow">
                <stop stopColor={system.environment.nebula} stopOpacity="0.5" />
                <stop offset="1" stopColor={system.environment.background} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill="url(#system-glow)" />
            {[12, 24, 36, 46].map((radius) => (
              <circle
                key={radius}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="#9fd5e9"
                strokeOpacity="0.09"
                strokeWidth="0.2"
              />
            ))}
            <path d="M50 0V100M0 50H100" stroke="#9fd5e9" strokeOpacity="0.06" strokeWidth="0.2" />
            {system.bodies
              .filter((body) => body.kind === 'moon')
              .map((body) => {
                const parent = chart.bodies.find((candidate) => candidate.id === body.parentId);
                const location = project(parent?.position ?? [0, 0, 0]);
                return (
                  <circle
                    key={body.id}
                    cx={location[0]}
                    cy={location[1]}
                    r="7"
                    fill="none"
                    stroke="#9fd5e9"
                    strokeOpacity="0.13"
                    strokeWidth="0.15"
                    strokeDasharray="0.5 1"
                  />
                );
              })}
          </svg>
          {system.bodies.map((body) => {
            const location = marker(body);
            return (
              <button
                key={body.id}
                type="button"
                aria-label={`Chart target ${body.name}`}
                aria-pressed={targetId === body.id}
                onClick={() => session.exploration.selectTarget(body.id)}
                style={{
                  left: `${location[0]}%`,
                  top: `${location[1]}%`,
                  color: body.kind === 'star' ? body.surface.palette[0] : system.environment.accent,
                }}
                className="absolute grid size-7 -translate-1/2 cursor-pointer place-items-center rounded-full border border-transparent hover:border-current focus-visible:outline-2 focus-visible:outline-current aria-pressed:border-current aria-pressed:bg-current/10"
              >
                <span
                  className={`rounded-full bg-current ${body.kind === 'star' ? 'size-3 shadow-[0_0_20px_currentColor]' : body.kind === 'moon' ? 'size-1' : 'size-2'}`}
                />
                {body.kind !== 'moon' && (
                  <span className="absolute top-full whitespace-nowrap font-mono text-[8px] text-slate-400">
                    {body.name}
                  </span>
                )}
              </button>
            );
          })}
          <div
            role="img"
            aria-label="Your approximate position"
            style={{
              left: `${Math.max(4, Math.min(96, player[0]))}%`,
              top: `${Math.max(4, Math.min(96, player[1]))}%`,
            }}
            className="pointer-events-none absolute -translate-1/2 text-amber-200"
          >
            <span className="block text-lg">⌁</span>
            <span className="absolute top-full left-1/2 -translate-x-1/2 font-mono text-[7px]">
              YOU
            </span>
          </div>
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
          Top-down survey chart · Moon orbits enlarged for legibility. Distances are measured to the
          surface. Select a contact to track it.
        </p>
      </div>
      <aside className="p-5 tablet:p-8" aria-label="Local celestial bodies">
        <h3 className="text-2xl font-light tracking-tight">{system.name}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{system.description}</p>
        <div className="mt-5 grid gap-1.5">
          {system.bodies.map((body) => (
            <button
              key={body.id}
              type="button"
              aria-label={`Target ${body.name}`}
              aria-pressed={targetId === body.id}
              onClick={() => session.exploration.selectTarget(body.id)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded border border-white/6 px-3 py-2.5 text-left hover:border-cyan-100/25 focus-visible:outline-2 focus-visible:outline-cyan-100 aria-pressed:border-cyan-100/30 aria-pressed:bg-cyan-100/5"
            >
              <span>
                <span className="block text-xs text-stone-200">{body.name}</span>
                <span className="mt-1 block font-mono text-[8px] uppercase tracking-wider text-slate-500">
                  {bodyLabel(body)}
                  {body.parentId && body.kind === 'moon'
                    ? ` / ${system.bodies.find((parent) => parent.id === body.parentId)?.name}`
                    : ''}
                </span>
              </span>
              <span className="whitespace-nowrap font-mono text-[10px] text-cyan-100/70">
                {formatDistance(
                  chart.bodies.find((candidate) => candidate.id === body.id)?.distance ?? 0,
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => session.exploration.selectTarget(null)}
            disabled={!targetId}
            className={flightButtonClassName}
          >
            Clear target <kbd className="ml-2 text-slate-500">X</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              session.exploration.closeMap();
              session.startKeyboard();
            }}
            className={`${flightButtonClassName} border-cyan-100/25 text-cyan-100`}
          >
            Resume keyboard flight
          </button>
        </div>
      </aside>
    </div>
  );
}
