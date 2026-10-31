import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { type ComponentRef, useEffect, useRef } from 'react';
import { INITIAL_CAMERA_POSITION } from '@/engine/rendering/SceneCanvas';

export function OrbitCamera() {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const invalidate = useThree((state) => state.invalidate);
  const framingScale = Math.max(1, 1.05 / aspect);

  useEffect(() => {
    // Keep the rings in frame on narrow screens. Resize and remount restore home.
    camera.position.set(...INITIAL_CAMERA_POSITION).multiplyScalar(framingScale);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [camera, framingScale, invalidate]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      minDistance={7}
      maxDistance={23 * framingScale}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI - 0.15}
      rotateSpeed={0.5}
      zoomSpeed={0.65}
    />
  );
}
