import { create } from 'zustand';
export const useRenderStatsStore = create<{
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  patches: number;
  cache: number;
  generationMs: number;
  visualMiB: number;
  sceneryCells: number;
  sceneryInstances: number;
  cityBlocks: number;
  workerFailures: number;
  captureRequest: number;
  captureResult: string;
}>(() => ({
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  patches: 0,
  cache: 0,
  generationMs: 0,
  visualMiB: 0,
  sceneryCells: 0,
  sceneryInstances: 0,
  cityBlocks: 0,
  workerFailures: 0,
  captureRequest: 0,
  captureResult: '',
}));
