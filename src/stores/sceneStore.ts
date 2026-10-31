import { create } from 'zustand';

interface SceneState {
  /** null follows the operating system's reduced-motion preference. */
  rotationEnabled: boolean | null;
  starsVisible: boolean;
  setRotationEnabled: (enabled: boolean) => void;
  toggleStars: () => void;
}

// Store discrete UI choices here. Transient transforms belong in Three.js refs.
export const useSceneStore = create<SceneState>()((set) => ({
  rotationEnabled: null,
  starsVisible: true,
  setRotationEnabled: (rotationEnabled) => set({ rotationEnabled }),
  toggleStars: () => set((state) => ({ starsVisible: !state.starsVisible })),
}));
