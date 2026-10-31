import { create } from 'zustand';

interface SceneState {
  /** null follows the operating system's reduced-motion preference. */
  rotationEnabled: boolean | null;
  starsVisible: boolean;
  viewResetId: number;
  setRotationEnabled: (enabled: boolean) => void;
  toggleStars: () => void;
  resetView: () => void;
}

// Store discrete UI choices here. Transient transforms belong in Three.js refs.
export const useSceneStore = create<SceneState>()((set) => ({
  rotationEnabled: null,
  starsVisible: true,
  viewResetId: 0,
  setRotationEnabled: (rotationEnabled) => set({ rotationEnabled }),
  toggleStars: () => set((state) => ({ starsVisible: !state.starsVisible })),
  resetView: () => set((state) => ({ viewResetId: state.viewResetId + 1 })),
}));
