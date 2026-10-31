import { Icon } from '@/components/ui/Icon';
import { useRotationEnabled } from '@/hooks/useRotationEnabled';
import { useSceneStore } from '@/stores/sceneStore';

export function SceneToolbar() {
  const rotationEnabled = useRotationEnabled();
  const starsVisible = useSceneStore((state) => state.starsVisible);
  const setRotationEnabled = useSceneStore((state) => state.setRotationEnabled);
  const toggleStars = useSceneStore((state) => state.toggleStars);
  const resetView = useSceneStore((state) => state.resetView);

  return (
    <fieldset className="scene-toolbar" aria-label="Scene controls">
      <button
        type="button"
        className="toolbar-button"
        onClick={() => setRotationEnabled(!rotationEnabled)}
        aria-pressed={!rotationEnabled}
        aria-label="Pause rotation"
        title={rotationEnabled ? 'Pause rotation' : 'Resume rotation'}
      >
        <Icon name={rotationEnabled ? 'pause' : 'play'} />
        <span>{rotationEnabled ? 'Pause' : 'Resume'}</span>
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        className="toolbar-button"
        onClick={toggleStars}
        aria-pressed={starsVisible}
        aria-label="Show stars"
        title={starsVisible ? 'Hide stars' : 'Show stars'}
      >
        <Icon name="stars" />
        <span>Stars</span>
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        className="toolbar-button"
        onClick={resetView}
        aria-label="Reset view"
        title="Reset camera view"
      >
        <Icon name="reset" />
        <span>Reset</span>
      </button>
    </fieldset>
  );
}
