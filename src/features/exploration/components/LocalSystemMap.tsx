import { instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import { type NavigationContact, navigationContacts } from '@/engine/navigation/contacts';
import type { Position3 } from '@/engine/world/worldTypes';
import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';

export function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}
export function bodyLabel(body: Pick<NavigationContact, 'kind'>) {
  if (body.kind === 'capital') return 'Capital';
  if (body.kind === 'city') return 'Regional city';
  if (body.kind === 'outpost') return 'Outpost';
  if (body.kind === 'station') return 'Station';
  if (body.kind === 'landing-zone') return 'Landing zone';
  if (body.kind === 'surface-poi') return 'Surface landmark';
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
  const contacts = navigationContacts(system).filter(
    (contact) =>
      !['capital', 'city', 'outpost', 'surface-poi', 'landing-zone'].includes(contact.kind) &&
      !system.stations?.some((s) => s.id === contact.id && s.type === 'surface'),
  );
  const range =
    Math.max(1, ...chart.bodies.map((body) => Math.hypot(body.position[0], body.position[2]))) *
    1.2;
  const project = (position: Position3) =>
    [50 + (position[0] / range) * 42, 50 + (position[2] / range) * 42] as const;
  const marker = (body: NavigationContact) => {
    const position = chart.bodies.find((candidate) => candidate.id === body.id)?.position ?? [
      0, 0, 0,
    ];
    const direct = project(position);
    if (['station', 'landing-zone', 'surface-poi'].includes(body.kind)) {
      const parent = chart.bodies.find((p) => p.id === body.parentId);
      const base = project(parent?.position ?? position);
      return [
        base[0] + (body.kind === 'station' ? 5 : 3),
        base[1] + (body.kind === 'station' ? 4 : -5),
      ] as const;
    }
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
      <div className="border-b border-line p-5 tablet:border-r tablet:border-b-0 tablet:p-8">
        <div className="flex justify-between font-mono text-[10px] tracking-widest text-phosphor-dim">
          <span>{system.name.toUpperCase()} / LOCAL CHART</span>
          <span>{contacts.length} CONTACTS</span>
        </div>
        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[440px] overflow-hidden border border-line crt-grid bg-[#030905]">
          <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
            {[12, 24, 36, 46].map((radius) => (
              <circle
                key={radius}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="#73f59b"
                strokeOpacity="0.28"
                strokeWidth="0.2"
              />
            ))}
            <path d="M50 0V100M0 50H100" stroke="#73f59b" strokeOpacity="0.3" strokeWidth="0.2" />
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
                    stroke="#73f59b"
                    strokeOpacity="0.13"
                    strokeWidth="0.15"
                    strokeDasharray="0.5 1"
                  />
                );
              })}
          </svg>
          {contacts.map((body) => {
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
                }}
                className={`absolute grid size-7 -translate-1/2 cursor-pointer place-items-center border border-transparent hover:border-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-current aria-pressed:bg-current/10 ${body.kind === 'star' || body.kind === 'station' ? 'text-instrument' : 'text-phosphor'}`}
              >
                <span
                  className={`rounded-full border border-current ${body.kind === 'star' ? 'size-3 bg-current/30' : body.kind === 'moon' ? 'size-1 bg-current' : 'size-2'}`}
                />
                {body.kind !== 'moon' &&
                  body.kind !== 'landing-zone' &&
                  body.kind !== 'surface-poi' && (
                    <span className="absolute top-full whitespace-nowrap font-mono text-[11px] text-phosphor-dim">
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
            className="pointer-events-none absolute -translate-1/2 text-instrument"
          >
            <span className="block text-lg">▲</span>
            <span className="absolute top-full left-1/2 -translate-x-1/2 font-mono text-[10px]">
              YOU
            </span>
          </div>
        </div>
        <button
          type="button"
          className={`${instrumentButtonClassName} mt-4`}
          onClick={() => session.exploration.openMap('planetary')}
        >
          Y / Open planetary survey
        </button>
        <p className="mt-4 text-[11px] leading-relaxed normal-case text-phosphor-dim">
          Top-down survey chart · Moon orbits enlarged for legibility. Distances are measured to the
          surface. Select a contact to track it.
        </p>
      </div>
      <aside className="p-5 tablet:p-8" aria-label="Local celestial bodies">
        <h3 className="text-2xl font-bold tracking-[0.06em]">{system.name}</h3>
        <p className="mt-2 text-xs leading-relaxed normal-case text-phosphor-dim">
          {system.description}
        </p>
        <div className="mt-5 flex justify-between border-y border-line py-2 text-[10px] tracking-widest text-phosphor-dim">
          <span>Contact / class</span>
          <span>Surface range</span>
        </div>
        <div className="mt-5 grid gap-1.5">
          {contacts.map((body) => (
            <button
              key={body.id}
              type="button"
              aria-label={`Target ${body.name}`}
              aria-pressed={targetId === body.id}
              onClick={() => session.exploration.selectTarget(body.id)}
              className="flex cursor-pointer items-center justify-between gap-3 border border-line px-3 py-2.5 text-left hover:border-phosphor/60 focus-visible:outline-2 focus-visible:outline-focus aria-pressed:border-phosphor aria-pressed:bg-phosphor/10"
            >
              <span>
                <span className="block text-xs text-phosphor">{body.name}</span>
                <span className="mt-1 block font-mono text-[11px] uppercase tracking-wider text-phosphor-dim">
                  {bodyLabel(body)}
                  {body.parentId && body.kind === 'moon'
                    ? ` / ${system.bodies.find((parent) => parent.id === body.parentId)?.name}`
                    : ''}
                </span>
              </span>
              <span className="whitespace-nowrap font-mono text-[12px] text-instrument">
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
            className={instrumentButtonClassName}
          >
            Clear target <kbd className="ml-2 text-phosphor-dim">X</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              session.exploration.closeMap();
              session.startKeyboard();
            }}
            className={`${instrumentButtonClassName} border-phosphor/60 text-phosphor`}
          >
            Resume keyboard flight
          </button>
        </div>
      </aside>
    </div>
  );
}
