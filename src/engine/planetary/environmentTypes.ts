/** Static, serializable environment contracts shared by rendering and authority. */
export type PlanetArchetype =
  | 'temperate'
  | 'desert'
  | 'oceanic'
  | 'frozen'
  | 'volcanic'
  | 'barren'
  | 'gas-giant';
export type Civilization = 'UNINHABITED' | 'OUTPOST' | 'COLONY' | 'DEVELOPED' | 'HIGHLY_URBANIZED';
export type WeatherKind = 'clear' | 'rain' | 'snow' | 'dust' | 'sandstorm' | 'ash';
export interface ClimateDefinition {
  readonly temperature: number;
  readonly moisture: number;
  readonly weather: readonly WeatherKind[];
  readonly period: number;
  readonly windSpeed: number;
  readonly cloudCover: number;
}
export type Biome =
  | 'ocean'
  | 'coast'
  | 'forest'
  | 'plains'
  | 'mountain'
  | 'polar'
  | 'dunes'
  | 'rock'
  | 'ice'
  | 'basalt'
  | 'lava';
export interface SettlementDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: 'capital' | 'regional' | 'outpost';
  readonly purpose:
    | 'administration'
    | 'trade'
    | 'mining'
    | 'research'
    | 'agriculture'
    | 'industry'
    | 'military';
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  /** Radius of the engineered foundation in metres. */
  readonly radius: number;
  readonly seed: number;
  readonly population: number;
  readonly style: 'towers' | 'domes' | 'habitats' | 'industrial' | 'modules';
}
export interface RestrictedZoneDefinition {
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radius: number;
  readonly ceiling: number;
}
