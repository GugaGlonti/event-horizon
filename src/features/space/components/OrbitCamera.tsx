import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { INITIAL_CAMERA_POSITION } from '@/engine/rendering/SceneCanvas';
import { useSceneStore } from '@/stores/sceneStore';

export function OrbitCamera() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const invalidate = useThree((state) => state.invalidate);
  const resetId = useSceneStore((state) => state.viewResetId);

  useEffect(() => {
    // reset() restores the target and clears accumulated control damping, too.
    if (resetId > 0 && controls && 'reset' in controls && typeof controls.reset === 'function') {
      controls.reset();
      camera.position.set(...INITIAL_CAMERA_POSITION);
      camera.lookAt(0, 0, 0);
      invalidate();
    }
  }, [camera, controls, invalidate, resetId]);

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      minDistance={7}
      maxDistance={23}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI - 0.15}
      rotateSpeed={0.5}
      zoomSpeed={0.65}
    />
  );
}
