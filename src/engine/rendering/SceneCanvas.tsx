import { Canvas, type CanvasProps } from '@react-three/fiber';
import type { ReactNode } from 'react';
import { SceneMessage } from '@/components/ui/SceneMessage';

interface SceneCanvasProps {
  children: ReactNode;
  onReady?: () => void;
  cameraSettings?: CanvasProps['camera'];
  label?: string;
  shadows?: CanvasProps['shadows'];
}

export const INITIAL_CAMERA_POSITION: [number, number, number] = [6, 3.2, 10];

export function SceneCanvas({
  children,
  onReady,
  cameraSettings,
  label,
  shadows = false,
}: SceneCanvasProps) {
  return (
    <Canvas
      shadows={shadows}
      camera={cameraSettings ?? { position: INITIAL_CAMERA_POSITION, fov: 52, near: 0.1, far: 200 }}
      onCreated={() => onReady?.()}
      dpr={
        import.meta.env.DEV &&
        new URLSearchParams(window.location.search).get('verifyDpr') === '1.5'
          ? 1.5
          : [1, 1.5]
      }
      gl={{
        logarithmicDepthBuffer: true,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      }}
      fallback={
        <SceneMessage title="A window into space needs WebGL 2.">
          Open this page in a compatible browser with hardware acceleration enabled to explore the
          scene.
        </SceneMessage>
      }
      aria-label={label ?? 'Interactive 3D view of Aster, a ringed celestial object'}
      aria-describedby="scene-instructions"
    >
      <color attach="background" args={['#080b10']} />
      {children}
    </Canvas>
  );
}
