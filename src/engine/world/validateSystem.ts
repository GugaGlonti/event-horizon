import { civilizations, validatePlanet } from './validatePlanet';
import type { StarSystemDefinition } from './worldTypes';

const kinds = new Set(['star', 'rocky', 'gas-giant', 'moon']);
const patterns = new Set(['ocean', 'desert', 'ice', 'volcanic', 'bands', 'cratered']);
const color = (value: string) => /^#[\da-f]{6}$/i.test(value);
const tuple = (value: readonly number[], size: number) =>
  value.length === size && value.every(Number.isFinite);
const positive = (value: number) => Number.isFinite(value) && value > 0;

/** Validate trusted typed definitions at the loading boundary, including edited JSON data. */
export function validateSystem(system: StarSystemDefinition): void {
  const fail = (message: string): never => {
    throw new Error(`${system.id}: ${message}`);
  };
  if (!/^[a-z][a-z0-9-]*$/.test(system.id) || !system.name.trim() || !system.description.trim())
    fail('Invalid system identity.');
  if (!tuple(system.chartPosition, 2)) fail('Invalid chart position.');
  if (!tuple(system.galacticPosition, 3)) fail('Invalid galactic position.');
  const environment = system.environment;
  if (
    ![environment.background, environment.nebula, environment.accent].every(color) ||
    !positive(environment.ambient) ||
    !Number.isFinite(environment.seed)
  )
    fail('Invalid environment.');
  const ids = new Map(system.bodies.map((body) => [body.id, body]));
  if (ids.size !== system.bodies.length) fail('Duplicate celestial IDs.');
  if (system.bodies.filter((body) => body.kind === 'star').length !== 1)
    fail('Exactly one central star is required.');
  if (system.civilization && !civilizations.includes(system.civilization))
    fail('Invalid system civilization.');
  const navigationIds = new Set(ids.keys());
  for (const body of system.bodies) {
    validatePlanet(body, fail);
    for (const city of body.settlements ?? []) {
      if (navigationIds.has(city.id)) fail('Duplicate navigation contact ID.');
      navigationIds.add(city.id);
      if (
        !system.stations?.some(
          (s) => s.id === `${city.id}-spaceport` && s.type === 'surface' && s.parentId === body.id,
        )
      )
        fail('Settlement needs a functional spaceport.');
    }
    if (!body.id || !body.name.trim() || !kinds.has(body.kind) || !positive(body.radius))
      fail('Invalid celestial metadata.');
    if (
      body.gravity &&
      (!positive(body.gravity.surfaceAcceleration) ||
        !positive(body.gravity.influenceRadius) ||
        body.gravity.influenceRadius <= body.radius)
    )
      fail(`Invalid gravity for ${body.id}.`);
    if (body.landable && (body.kind === 'gas-giant' || body.kind === 'star' || !body.terrain))
      fail(`Invalid landing capability for ${body.id}.`);
    if (
      body.terrain &&
      (!Number.isInteger(body.terrain.seed) ||
        !positive(body.terrain.relief) ||
        !positive(body.terrain.frequency) ||
        !Number.isInteger(body.terrain.octaves) ||
        body.terrain.octaves < 1 ||
        body.terrain.octaves > 8 ||
        ![8, 16, 32].includes(body.terrain.patchResolution) ||
        !Number.isInteger(body.terrain.maxLevel) ||
        body.terrain.maxLevel < 1 ||
        body.terrain.maxLevel > 14)
    )
      fail(`Invalid terrain for ${body.id}.`);
    const zoneIds = new Set<string>();
    for (const zone of body.landingZones ?? []) {
      if (
        !zone.id ||
        zoneIds.has(zone.id) ||
        !zone.name.trim() ||
        !Number.isFinite(zone.latitude) ||
        Math.abs(zone.latitude) > Math.PI / 2 ||
        !Number.isFinite(zone.longitude) ||
        !positive(zone.radius) ||
        !Number.isFinite(zone.elevation)
      )
        fail(`Invalid landing zone for ${body.id}.`);
      if (navigationIds.has(zone.id)) fail('Duplicate navigation contact ID.');
      navigationIds.add(zone.id);
      zoneIds.add(zone.id);
    }
    if (
      body.atmosphere?.height !== undefined &&
      (!positive(body.atmosphere.height) ||
        !positive(body.atmosphere.scaleHeight ?? 0) ||
        !positive(body.atmosphere.density ?? 0) ||
        Math.abs(body.atmosphere.height - body.radius * (body.atmosphere.scale - 1)) > 0.01)
    )
      fail(`Invalid physical atmosphere for ${body.id}.`);
    for (const point of body.pointsOfInterest ?? []) {
      if (
        !point.id ||
        !point.name.trim() ||
        navigationIds.has(point.id) ||
        !Number.isFinite(point.latitude) ||
        Math.abs(point.latitude) > Math.PI / 2 ||
        !Number.isFinite(point.longitude)
      )
        fail('Invalid surface point.');
      navigationIds.add(point.id);
    }
    if (Boolean(body.position) === Boolean(body.orbit))
      fail(`${body.id} needs a position or an orbit, exclusively.`);
    if (body.position && !tuple(body.position, 3)) fail(`Invalid position for ${body.id}.`);
    if (body.kind === 'star' ? body.parentId || body.orbit : !body.parentId)
      fail(`Invalid parent for ${body.id}.`);
    if (body.parentId && !ids.has(body.parentId)) fail(`Unknown parent for ${body.id}.`);
    if (
      body.kind === 'moon' &&
      ids.get(body.parentId ?? '')?.kind !== 'rocky' &&
      ids.get(body.parentId ?? '')?.kind !== 'gas-giant'
    )
      fail(`Moon ${body.id} needs a planet parent.`);
    if (
      body.orbit &&
      (!positive(body.orbit.radius) ||
        !positive(body.orbit.period) ||
        !Number.isFinite(body.orbit.phase) ||
        !Number.isFinite(body.orbit.inclination) ||
        body.orbit.radius <= body.radius + (ids.get(body.parentId ?? '')?.radius ?? 0))
    )
      fail(`Invalid orbit for ${body.id}.`);
    if (
      !Number.isFinite(body.rotation.tilt) ||
      !Number.isFinite(body.rotation.speed) ||
      !patterns.has(body.surface.pattern) ||
      body.surface.palette.length !== 3 ||
      !body.surface.palette.every(color) ||
      !Number.isFinite(body.surface.seed) ||
      !positive(body.surface.brightness)
    )
      fail(`Invalid appearance for ${body.id}.`);
    if (
      body.atmosphere &&
      (!color(body.atmosphere.color) ||
        !positive(body.atmosphere.strength) ||
        !positive(body.atmosphere.scale) ||
        body.atmosphere.scale <= 1)
    )
      fail(`Invalid atmosphere for ${body.id}.`);
    if (
      body.rings &&
      (!positive(body.rings.inner) ||
        body.rings.inner <= 1 ||
        !positive(body.rings.outer) ||
        body.rings.outer <= body.rings.inner ||
        !color(body.rings.color) ||
        !Number.isFinite(body.rings.tilt))
    )
      fail(`Invalid rings for ${body.id}.`);
    const seen = new Set<string>([body.id]);
    let parent = body.parentId;
    while (parent) {
      if (seen.has(parent)) fail(`Cyclic parent relationship for ${body.id}.`);
      seen.add(parent);
      parent = ids.get(parent)?.parentId;
    }
  }
  if (!ids.has(system.defaultTargetId)) fail('Unknown default navigation target.');
  const stationIds = new Set<string>();
  for (const station of system.stations ?? []) {
    if (
      !station.id ||
      stationIds.has(station.id) ||
      navigationIds.has(station.id) ||
      !station.name.trim() ||
      !tuple(station.position, 3) ||
      !tuple(station.orientation, 4) ||
      Math.abs(Math.hypot(...station.orientation) - 1) > 0.001 ||
      (station.parentId && !ids.has(station.parentId))
    )
      fail('Invalid station definition.');
    if (!['orbital', 'industrial', 'surface'].includes(station.type)) fail('Invalid station type.');
    if (station.surfaceAnchor) {
      const anchor = station.surfaceAnchor,
        body = ids.get(station.parentId ?? '');
      if (
        station.type !== 'surface' ||
        station.orbit ||
        !body?.landable ||
        !Number.isFinite(anchor.latitude) ||
        Math.abs(anchor.latitude) > Math.PI / 2 ||
        !Number.isFinite(anchor.longitude) ||
        Math.abs(anchor.longitude) > Math.PI ||
        !Number.isFinite(anchor.elevation) ||
        anchor.elevation <= (body.ocean?.level ?? -Infinity)
      )
        fail('Invalid surface station anchor.');
    } else if (station.type === 'surface') fail('Surface station requires a body anchor.');
    stationIds.add(station.id);
    navigationIds.add(station.id);
    if (
      station.orbit &&
      (!positive(station.orbit.radius) ||
        !positive(station.orbit.period) ||
        !Number.isFinite(station.orbit.phase) ||
        !Number.isFinite(station.orbit.inclination))
    )
      fail('Invalid station orbit.');
    const ports = new Set<string>();
    for (const port of station.ports) {
      if (
        !port.id ||
        ports.has(port.id) ||
        !port.name.trim() ||
        !tuple(port.position, 3) ||
        !tuple(port.approach, 3) ||
        !tuple(port.orientation, 4) ||
        Math.abs(Math.hypot(...port.orientation) - 1) > 0.001 ||
        !['external', 'hangar', 'surface'].includes(port.kind)
      )
        fail('Invalid docking port.');
      ports.add(port.id);
    }
    if (
      !ports.size ||
      station.boxes.length > 512 ||
      !station.boxes.length ||
      station.boxes.some(
        (box) => !tuple(box.center, 3) || !tuple(box.size, 3) || !box.size.every(positive),
      )
    )
      fail('Invalid station collision geometry.');
    if (
      station.boxes.some(
        (box) =>
          box.orientation &&
          (!tuple(box.orientation, 4) || Math.abs(Math.hypot(...box.orientation) - 1) > 0.001),
      )
    )
      fail('Invalid station box orientation.');
    if (station.services.some((service) => !['repair', 'shields', 'weapons'].includes(service)))
      fail('Invalid station service.');
  }
  if (
    (system.stations?.length ?? 0) > 16 ||
    (system.stations ?? []).reduce((sum, station) => sum + station.ports.length, 0) > 32
  )
    fail('Station budget exceeded.');
  if (
    !system.spawns.length ||
    new Set(system.spawns.map((spawn) => spawn.id)).size !== system.spawns.length
  )
    fail('Invalid or duplicate spawn IDs.');
  if (!system.spawns.some((spawn) => spawn.id === system.arrivalId)) fail('Unknown arrival point.');
  for (const spawn of system.spawns) {
    if (
      !spawn.id ||
      !ids.has(spawn.bodyId) ||
      !tuple(spawn.offset, 3) ||
      !tuple(spawn.orientation, 4) ||
      Math.abs(Math.hypot(...spawn.orientation) - 1) > 0.001
    )
      fail('Invalid spawn point.');
    if (Math.hypot(...spawn.offset) <= (ids.get(spawn.bodyId)?.radius ?? 0) + 100)
      fail('Spawn is inside its anchor safety zone.');
  }
}

export function validateCatalog(systems: readonly StarSystemDefinition[]) {
  if (new Set(systems.map((system) => system.id)).size !== systems.length)
    throw new Error('Duplicate star system IDs.');
  for (const system of systems) validateSystem(system);
  if (new Set(systems.map((system) => system.galacticPosition.join(','))).size !== systems.length)
    throw new Error('Star systems need distinct galactic positions.');
}
