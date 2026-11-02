import { useMemo, useState } from 'react';
import { InstrumentButton, instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import { Vector3 } from '@/engine/math/linear';
import { bodyRotation, surfaceCoordinates, surfaceDirection } from '@/engine/planetary/coordinates';
import { surfaceBiome } from '@/engine/planetary/environment';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { formatDistance } from './LocalSystemMap';

const biomeColors = {
  ocean: '#102f3c',
  coast: '#456858',
  forest: '#214b32',
  plains: '#36543a',
  mountain: '#6f776c',
  polar: '#bdccca',
  dunes: '#997747',
  rock: '#585b59',
  ice: '#91acbf',
  basalt: '#36343a',
  lava: '#ab5834',
};
function SurfaceChart({ body }: { body: CelestialDefinition }) {
  const cells = useMemo(
    () =>
      Array.from({ length: 48 * 24 }, (_, i) => {
        const x = i % 48,
          y = Math.floor(i / 48);
        return {
          x,
          y,
          color:
            biomeColors[
              surfaceBiome(
                body,
                surfaceDirection(
                  (0.5 - (y + 0.5) / 24) * Math.PI,
                  ((x + 0.5) / 48 - 0.5) * Math.PI * 2,
                ),
              )
            ],
        };
      }),
    [body],
  );
  return (
    <>
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x * 10}
          y={cell.y * 10}
          width="10.1"
          height="10.1"
          fill={cell.color}
        />
      ))}
    </>
  );
}
export function PlanetaryMap({ session }: { session: FlightSession }) {
  const chart = useExplorationStore((s) => s.chart),
    targetId = useExplorationStore((s) => s.navigation.targetId);
  const world = session.exploration.world,
    bodies = world.definition.bodies.filter((b) => b.kind !== 'star' && b.kind !== 'gas-giant');
  const [bodyId, setBodyId] = useState(() => {
    const target = bodies.find(
      (b) =>
        b.id === targetId ||
        b.settlements?.some((c) => c.id === targetId) ||
        world.definition.stations?.some((s) => s.id === targetId && s.parentId === b.id),
    );
    return target?.id ?? session.planetaryReadout.bodyId ?? bodies[0]?.id;
  });
  const body = bodies.find((b) => b.id === bodyId) ?? bodies[0];
  if (!body) return <p className="p-8">No solid worlds charted.</p>;
  const center = world.positions.get(body.id) ?? new Vector3();
  const local = new Vector3()
    .fromArray(chart.ship)
    .sub(center)
    .normalize()
    .applyQuaternion(bodyRotation(body, world.time).invert());
  const coordinates = surfaceCoordinates(local);
  const project = (latitude: number, longitude: number) =>
    [50 + (longitude / Math.PI) * 50, 50 - (latitude / Math.PI) * 100] as const;
  const locations = [
    ...(body.settlements ?? []).map((city) => ({
      ...city,
      label: `${city.kind} / ${city.purpose}`,
      spaceport: `${city.id}-spaceport`,
    })),
    ...(body.landingZones ?? []).map((zone) => ({
      ...zone,
      label: 'Landing zone',
      spaceport: null,
    })),
    ...(body.pointsOfInterest ?? []).map((poi) => ({
      ...poi,
      label: 'Natural landmark',
      spaceport: null,
    })),
  ];
  const player = project(coordinates.latitude, coordinates.longitude);
  return (
    <div className="p-5 tablet:p-8">
      <fieldset className="flex flex-wrap gap-2" aria-label="Survey planet">
        {bodies.map((b) => (
          <button
            key={b.id}
            type="button"
            className={instrumentButtonClassName}
            aria-pressed={body.id === b.id}
            onClick={() => setBodyId(b.id)}
          >
            {b.name}
          </button>
        ))}
      </fieldset>
      <div className="mt-6 grid gap-6 tablet:grid-cols-[1.5fr_1fr]">
        <div>
          <h3 className="text-2xl">{body.name}</h3>
          <p className="mt-2 text-xs text-phosphor-dim">
            {body.archetype} / {body.civilization?.replaceAll('_', ' ')} / R{' '}
            {formatDistance(body.radius)}
          </p>
          <div className="relative mt-4 aspect-2/1 overflow-hidden border border-line">
            <svg
              className="absolute inset-0 size-full"
              viewBox="0 0 480 240"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <SurfaceChart body={body} />
            </svg>
            {(body.restrictedZones ?? []).map((zone) => {
              const p = project(zone.latitude, zone.longitude);
              return (
                <span
                  key={zone.id}
                  title={zone.name}
                  style={{ left: `${p[0]}%`, top: `${p[1]}%` }}
                  className="pointer-events-none absolute size-9 -translate-1/2 rounded-full border border-instrument bg-instrument/20"
                />
              );
            })}
            {locations.map((location) => {
              const p = project(location.latitude, location.longitude);
              return (
                <button
                  key={location.id}
                  type="button"
                  aria-label={`Chart ${location.name}`}
                  aria-pressed={targetId === location.id}
                  onClick={() => session.exploration.selectTarget(location.id)}
                  style={{ left: `${p[0]}%`, top: `${p[1]}%` }}
                  className="absolute grid size-8 -translate-1/2 place-items-center border border-transparent text-phosphor hover:border-current focus-visible:outline-2 focus-visible:outline-focus aria-pressed:border-instrument aria-pressed:text-instrument"
                >
                  <span className="bg-console px-1">
                    {location.label.startsWith('capital') ? '★' : location.spaceport ? '◆' : '◇'}
                  </span>
                </button>
              );
            })}
            <span
              role="img"
              aria-label="Your body-relative position"
              style={{ left: `${player[0]}%`, top: `${player[1]}%` }}
              className="pointer-events-none absolute -translate-1/2 text-instrument"
            >
              ▲
            </span>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-phosphor-dim">
            Body-fixed survey · ★ capital · ◆ city / spaceport · ◇ landmark / landing zone · amber:
            restricted airspace. Symbols enlarged for legibility. Surface colors use the shared
            terrain field.
          </p>
          <p className="mt-3 text-xs">
            POSITION {((coordinates.latitude * 180) / Math.PI).toFixed(2)}° /{' '}
            {((coordinates.longitude * 180) / Math.PI).toFixed(2)}°
          </p>
          <p className="mt-2 text-xs text-instrument">{body.hazards?.join(' / ')}</p>
        </div>
        <aside aria-label="Planetary destinations">
          <p className="text-xs text-phosphor-dim">Surface destinations / ground range</p>
          <div className="mt-3 grid gap-2">
            {locations.map((location) => {
              const distance =
                Math.acos(
                  Math.max(
                    -1,
                    Math.min(1, local.dot(surfaceDirection(location.latitude, location.longitude))),
                  ),
                ) * body.radius;
              return (
                <div key={location.id} className="border border-line p-3">
                  <button
                    type="button"
                    onClick={() => session.exploration.selectTarget(location.id)}
                    aria-pressed={targetId === location.id}
                    className="w-full cursor-pointer text-left text-xs focus-visible:outline-2 focus-visible:outline-focus aria-pressed:text-instrument"
                  >
                    <span className="block">{location.name}</span>
                    <span className="mt-1 block text-[10px] text-phosphor-dim">
                      {location.label} / {formatDistance(distance)}
                    </span>
                  </button>
                  {location.spaceport && (
                    <InstrumentButton
                      variant="hud"
                      className="mt-2"
                      aria-pressed={targetId === location.spaceport}
                      onClick={() => session.exploration.selectTarget(location.spaceport)}
                    >
                      Target spaceport
                    </InstrumentButton>
                  )}
                </div>
              );
            })}
            {!locations.length && (
              <p className="text-xs text-phosphor-dim">
                Uninhabited survey world. Natural terrain landing available on safe dry ground.
              </p>
            )}
          </div>
          <InstrumentButton
            className="mt-5"
            onClick={() => {
              session.exploration.closeMap();
              session.startKeyboard();
            }}
          >
            Resume keyboard flight
          </InstrumentButton>
        </aside>
      </div>
    </div>
  );
}
