import type { StationBox, StationDefinition } from './stationTypes';
export const SOLARA_STATION: StationDefinition = {
  id: 'solara-orbital',
  name: 'Solara Orbital',
  type: 'orbital',
  parentId: 'pelagos',
  position: [-124800, 0, 164000],
  orientation: [0, 0, 0, 1],
  ports: [
    {
      id: 'hangar-1',
      name: 'Survey Hangar 1',
      kind: 'hangar',
      position: [0, -35, 70],
      orientation: [0, 0, 0, 1],
      approach: [0, -35, 440],
    },
    {
      id: 'port-east',
      name: 'East Berth',
      kind: 'external',
      position: [290, 0, 80],
      orientation: [0, 0, 0, 1],
      approach: [290, 0, 410],
    },
    {
      id: 'port-west',
      name: 'West Berth',
      kind: 'external',
      position: [-290, 0, 80],
      orientation: [0, 0, 0, 1],
      approach: [-290, 0, 410],
    },
  ],
  boxes: [
    ...Array.from({ length: 16 }, (_, i): StationBox => {
      const a = (i * Math.PI) / 8;
      return {
        center: [260 * Math.cos(a), 110, -230 + 260 * Math.sin(a)],
        size: [24, 24, 102],
        orientation: [0, -Math.sin(a / 2), 0, Math.cos(a / 2)],
        role: 'hull',
      };
    }),
    { center: [0, 20, -230], size: [260, 240, 240], role: 'hull' },
    { center: [0, -48, 70], size: [180, 16, 340], role: 'hangar' },
    { center: [0, 78, 70], size: [180, 16, 340], role: 'hangar' },
    { center: [-95, 15, 70], size: [20, 110, 340], role: 'hangar' },
    { center: [95, 15, 70], size: [20, 110, 340], role: 'hangar' },
    { center: [0, 15, -100], size: [180, 110, 20], role: 'hangar' },
    { center: [-225, 0, -40], size: [220, 30, 35], role: 'arm' },
    { center: [225, 0, -40], size: [220, 30, 35], role: 'arm' },
    { center: [-290, 0, 25], size: [45, 45, 50], role: 'arm' },
    { center: [290, 0, 25], size: [45, 45, 50], role: 'arm' },
    { center: [0, 240, -230], size: [45, 220, 45], role: 'hull' },
  ],
  services: ['repair', 'shields', 'weapons'],
};
export const VESPER_STATION: StationDefinition = {
  id: 'vesper-outpost',
  name: 'Vesper Outpost',
  type: 'industrial',
  parentId: 'nacre',
  position: [0, 20000, 737000],
  orientation: [0, 0, 0, 1],
  ports: [
    {
      id: 'freight-1',
      name: 'Freight Berth',
      kind: 'external',
      position: [0, 0, 100],
      orientation: [0, 0, 0, 1],
      approach: [0, 0, 430],
    },
  ],
  boxes: [
    { center: [0, 0, -75], size: [150, 120, 150], role: 'hull' },
    { center: [0, -45, 45], size: [100, 20, 180], role: 'arm' },
    { center: [-140, 0, -70], size: [40, 200, 100], role: 'hull' },
    { center: [140, 0, -70], size: [40, 200, 100], role: 'hull' },
    { center: [0, 0, 25], size: [40, 40, 50], role: 'arm' },
  ],
  services: ['repair', 'shields', 'weapons'],
};
