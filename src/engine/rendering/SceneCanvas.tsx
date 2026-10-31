import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';
import { SceneMessage } from '@/components/ui/SceneMessage';

interface SceneCanvasProps {
  children: ReactNode;
}

export const INITIAL_CAMERA_POSITION: [number, number, number] = [6, 3.2, 10];

export function SceneCanvas({ children }: SceneCanvasProps) {
  return (
    <Canvas
      camera={{ position: INITIAL_CAMERA_POSITION, fov: 42, near: 0.1, far: 200 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      fallback={
        <SceneMessage title="A window into space needs WebGL 2.">
          Open this page in a compatible browser with hardware acceleration enabled to explore the
          scene.
        </SceneMessage>
      }
      aria-label="Interactive 3D view of Aster, a ringed celestial object"
      aria-describedby="scene-instructions"
    >
      <color attach="background" args={['#080b10']} />
      {children}
    </Canvas>
  );
}
