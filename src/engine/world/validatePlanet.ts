import { settlementSuitability } from '@/engine/planetary/cities';
import { surfaceDirection } from '@/engine/planetary/coordinates';
import type { CelestialDefinition } from './worldTypes';

const archetypes = ['temperate', 'desert', 'oceanic', 'frozen', 'volcanic', 'barren', 'gas-giant'];
export const civilizations = ['UNINHABITED', 'OUTPOST', 'COLONY', 'DEVELOPED', 'HIGHLY_URBANIZED'];
export function validatePlanet(body: CelestialDefinition, fail: (message: string) => never) {
  const finite = Number.isFinite;
  const geographic = (p: { latitude: number; longitude: number }) =>
    finite(p.latitude) &&
    Math.abs(p.latitude) <= Math.PI / 2 &&
    finite(p.longitude) &&
    Math.abs(p.longitude) <= Math.PI;
  if (
    body.archetype &&
    (!archetypes.includes(body.archetype) ||
      (body.archetype === 'gas-giant') !== (body.kind === 'gas-giant'))
  )
    fail(`Invalid archetype for ${body.id}.`);
  if (body.civilization && !civilizations.includes(body.civilization))
    fail('Invalid civilization.');
  if (
    body.ocean &&
    (!finite(body.ocean.level) ||
      body.ocean.level < 0 ||
      !/^#[\da-f]{6}$/i.test(body.ocean.color) ||
      !body.terrain ||
      body.ocean.level >= body.terrain.relief)
  )
    fail('Invalid ocean.');
  const climate = body.climate;
  if (
    climate &&
    (!finite(climate.temperature) ||
      climate.temperature < 0 ||
      !finite(climate.moisture) ||
      climate.moisture < 0 ||
      climate.moisture > 1 ||
      !finite(climate.period) ||
      climate.period <= 0 ||
      !finite(climate.windSpeed) ||
      climate.windSpeed < 0 ||
      climate.windSpeed > 100 ||
      !finite(climate.cloudCover) ||
      climate.cloudCover < 0 ||
      climate.cloudCover > 1 ||
      climate.weather.length > 8 ||
      climate.weather.some(
        (w) => !['clear', 'rain', 'snow', 'dust', 'sandstorm', 'ash'].includes(w),
      ))
  )
    fail('Invalid climate.');
  const cities = body.settlements ?? [];
  if (
    cities.length > 8 ||
    (cities.length && (!body.landable || body.civilization === 'UNINHABITED'))
  )
    fail('Invalid settlement eligibility.');
  const developed = body.civilization === 'DEVELOPED' || body.civilization === 'HIGHLY_URBANIZED';
  if (cities.filter((s) => s.kind === 'capital').length !== (developed ? 1 : 0))
    fail('Developed worlds require exactly one capital.');
  const regions = cities.filter((s) => s.kind === 'regional').length;
  if (developed && (regions < 3 || regions > 6))
    fail('Developed worlds require three to six regional cities.');
  for (const city of cities) {
    if (!settlementSuitability(body, city.latitude, city.longitude).suitable)
      fail('Unsuitable settlement terrain.');
    if (
      !city.id ||
      !city.name.trim() ||
      !geographic(city) ||
      !finite(city.radius) ||
      city.radius < 100 ||
      city.radius > body.radius * 0.05 ||
      !finite(city.elevation) ||
      city.elevation <= (body.ocean?.level ?? -Infinity) ||
      !Number.isInteger(city.seed) ||
      !Number.isInteger(city.population) ||
      city.population < 0 ||
      !['capital', 'regional', 'outpost'].includes(city.kind) ||
      !['towers', 'domes', 'habitats', 'industrial', 'modules'].includes(city.style) ||
      ![
        'administration',
        'trade',
        'mining',
        'research',
        'agriculture',
        'industry',
        'military',
      ].includes(city.purpose)
    )
      fail('Invalid settlement metadata.');
    for (const other of cities)
      if (
        other !== city &&
        surfaceDirection(city.latitude, city.longitude).distanceTo(
          surfaceDirection(other.latitude, other.longitude),
        ) *
          body.radius <
          (city.radius + other.radius) * 2
      )
        fail('Settlements overlap.');
  }
  for (const point of body.pointsOfInterest ?? [])
    if (
      point.landform &&
      !['canyon', 'mountain', 'caldera', 'crater', 'archipelago', 'fracture'].includes(
        point.landform,
      )
    )
      fail('Invalid landmark landform.');
  for (const zone of body.restrictedZones ?? [])
    if (
      !zone.id ||
      !zone.name.trim() ||
      !geographic(zone) ||
      !finite(zone.radius) ||
      zone.radius <= 0 ||
      !finite(zone.ceiling) ||
      zone.ceiling <= 0
    )
      fail('Invalid restricted airspace.');
}
