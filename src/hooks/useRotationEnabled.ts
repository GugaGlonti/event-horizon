import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSceneStore } from '@/stores/sceneStore';

export function useRotationEnabled() {
  const override = useSceneStore((state) => state.rotationEnabled);
  const reducedMotion = useReducedMotion();
  return override ?? !reducedMotion;
}
