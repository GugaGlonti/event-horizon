import { Stars } from '@react-three/drei';
import { SceneCanvas } from '@/engine/rendering/SceneCanvas';
import { CelestialBody } from '@/features/planets/components/CelestialBody';
import { OrbitCamera } from '@/features/space/components/OrbitCamera';
import { useSceneStore } from '@/stores/sceneStore';

export default function SpaceScene() {
  const starsVisible = useSceneStore((state) => state.starsVisible);

  return (
    <SceneCanvas>
      <ambientLight color="#b7c6df" intensity={0.18} />
      <directionalLight position={[-5, 5, 6]} color="#ffdfb5" intensity={3.2} />
      <directionalLight position={[2, 1, -5]} color="#8aaac8" intensity={0.45} />
      <CelestialBody />
      {starsVisible && (
        <Stars radius={80} depth={35} count={2400} factor={2} saturation={0} fade speed={0} />
      )}
      <OrbitCamera />
    </SceneCanvas>
  );
}
