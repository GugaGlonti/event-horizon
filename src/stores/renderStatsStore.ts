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
}));
