import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { PLANET_MARKER_SIZE, PlanetMarkerProjector } from '@/features/exploration/planetMarkers';
import { GAME_CONFIG } from '@/features/flight/config';

function setup(width = 1440, height = 900, limit: number = GAME_CONFIG.planetMarkers.limit) {
  const definition = SYSTEMS.find((system) => system.id === 'solara');
  if (!definition) throw new Error('Missing fixture.');
  const world = new SystemRuntime(definition);
  for (const position of world.positions.values()) position.set(1e6, 0, -1e6);
  const camera = new PerspectiveCamera(62, width / height, 0.1, 65000);
  const ship = new Vector3();
  const origin = new Vector3();
  const viewport = { width, height };
  const projector = new PlanetMarkerProjector({ ...GAME_CONFIG.planetMarkers, limit });
  return {
    world,
    camera,
    ship,
    origin,
    place: (id: string, x: number, y: number, z: number) => {
      const position = world.positions.get(id);
      if (!position) throw new Error(`Missing fixture body ${id}.`);
      position.set(x, y, z);
    },
    sample: () => {
      camera.updateMatrixWorld();
      return projector.sample(world, ship, camera, origin, viewport);
    },
  };
}

describe('nearby planet edge markers', () => {
  it('leaves visible planets to the scene and existing selected-target marker', () => {
    const view = setup();
    view.place('pelagos', 0, 0, -4000);
    expect(view.sample()).toEqual([]);
  });

  it.each([
    [-6000, 0, -1000, 'left', false],
    [6000, 0, -1000, 'right', false],
    [0, 6000, -1000, 'top', false],
    [0, -6000, -1000, 'bottom', false],
    [-6000, 0, 1000, 'left', true],
    [6000, 0, 1000, 'right', true],
    [0, 6000, 1000, 'top', true],
    [0, -6000, 1000, 'bottom', true],
  ] as const)(
    'projects (%s, %s, %s) to the %s edge without mirroring rear bearings',
    (x, y, z, edge, behind) => {
      const view = setup();
      view.place('pelagos', x, y, z);
      const marker = view.sample()[0];
      expect(marker).toMatchObject({ id: 'pelagos', name: 'Pelagos', edge, behind });
      expect(marker?.surfaceDistance).toBeCloseTo(Math.hypot(x, y, z) - 620);
      expect(Number.isFinite(marker?.x)).toBe(true);
      expect(Number.isFinite(marker?.y)).toBe(true);
      expect(Number.isFinite(marker?.angle)).toBe(true);
    },
  );

  it('gives a finite, explicit aft bearing to a planet directly behind the camera', () => {
    const view = setup();
    view.place('pelagos', 0, 0, 4000);
    expect(view.sample()[0]).toMatchObject({ edge: 'bottom', behind: true, angle: 90, x: 720 });
  });

  it('uses the surface range limit and excludes stars and moons', () => {
    const view = setup();
    view.place('solara-star', 500, 0, 500);
    view.place('lyra', -500, 0, 500);
    view.place('pelagos', 0, 0, GAME_CONFIG.planetMarkers.range + 620);
    expect(view.sample().map((marker) => marker.id)).toEqual(['pelagos']);
    view.place('pelagos', 0, 0, GAME_CONFIG.planetMarkers.range + 621);
    expect(view.sample()).toEqual([]);
  });

  it('includes gas giants and retains the nearest contacts when the display limit is reached', () => {
    const view = setup(1440, 900, 2);
    view.place('pelagos', 5000, 0, -1000);
    view.place('aureole', 6000, 0, -1000);
    view.place('cairn', 9000, 0, -1000);
    expect(view.sample().map((marker) => marker.id)).toEqual(['pelagos', 'aureole']);
  });

  it('separates labels sharing an edge while preserving their pointing direction', () => {
    const view = setup();
    view.place('pelagos', 5000, 0, -1000);
    view.place('cairn', 7000, 0, -1000);
    view.place('aureole', 9000, 0, -1000);
    const markers = view.sample();
    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(marker.edge).toBe('right');
      expect(marker.angle).toBeCloseTo(0);
      for (const other of markers) {
        if (marker.id === other.id) continue;
        expect(Math.abs(marker.y - other.y)).toBeGreaterThanOrEqual(
          PLANET_MARKER_SIZE.height + PLANET_MARKER_SIZE.gap,
        );
      }
    }
  });

  it('prioritizes the nearest label when a compact viewport cannot fit all contacts', () => {
    const view = setup(320, 640);
    view.place('pelagos', 5000, 0, -1000);
    view.place('cairn', 7000, 0, -1000);
    view.place('aureole', 9000, 0, -1000);
    const markers = view.sample();
    expect(markers.map((marker) => marker.id)).toEqual(['pelagos']);
    const marker = markers[0];
    expect(marker?.x).toBeLessThanOrEqual(320 - 12 - PLANET_MARKER_SIZE.width / 2);
    expect(marker?.y).toBeGreaterThanOrEqual(236 + PLANET_MARKER_SIZE.height / 2);
    expect(marker?.y).toBeLessThanOrEqual(640 - 340 - PLANET_MARKER_SIZE.height / 2);
  });

  it.each([
    [0, 0],
    [320, 560],
    [NaN, 900],
    [1440, Infinity],
  ])('hides labels when viewport %s × %s has no usable flight area', (width, height) => {
    const view = setup(width, height);
    view.place('pelagos', 5000, 0, 1000);
    expect(view.sample()).toEqual([]);
  });

  it('follows the rendered camera orientation and FOV independently of the ship pose', () => {
    const view = setup();
    view.place('pelagos', 1500, 0, -4000);
    expect(view.sample()).toEqual([]);
    view.camera.fov = 20;
    view.camera.updateProjectionMatrix();
    expect(view.sample()[0]?.edge).toBe('right');
    view.camera.fov = 62;
    view.camera.updateProjectionMatrix();
    view.camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    expect(view.sample()[0]?.edge).toBe('right');
    expect(view.ship.toArray()).toEqual([0, 0, 0]);
  });

  it('keeps marker positions and logical surface distances unchanged across render-origin rebases', () => {
    const view = setup();
    view.ship.set(1e12, 200, -1e12);
    view.camera.position.copy(view.ship).add(new Vector3(0, 3, 12));
    view.place('pelagos', view.ship.x + 6000, 200, view.ship.z - 1000);
    const before = view.sample()[0];
    view.origin.set(view.ship.x + 1024, 0, view.ship.z - 1024);
    view.camera.position.sub(view.origin);
    const after = view.sample()[0];
    expect(after).toEqual(before);
  });
});
