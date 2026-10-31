import { beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from '@/stores/sceneStore';

describe('scene settings', () => {
  beforeEach(() => {
    useSceneStore.setState(useSceneStore.getInitialState(), true);
  });

  it('follows system motion preferences until the user chooses explicitly', () => {
    expect(useSceneStore.getState().rotationEnabled).toBeNull();
    useSceneStore.getState().setRotationEnabled(false);
    expect(useSceneStore.getState().rotationEnabled).toBe(false);
    useSceneStore.getState().setRotationEnabled(true);
    expect(useSceneStore.getState().rotationEnabled).toBe(true);
  });

  it('toggles stars without changing the rotation preference', () => {
    useSceneStore.getState().toggleStars();
    expect(useSceneStore.getState().starsVisible).toBe(false);
    expect(useSceneStore.getState().rotationEnabled).toBeNull();
    useSceneStore.getState().toggleStars();
    expect(useSceneStore.getState().starsVisible).toBe(true);
  });

  it('issues a distinct camera reset request on each click', () => {
    const resetView = useSceneStore.getState().resetView;
    resetView();
    resetView();
    expect(useSceneStore.getState().viewResetId).toBe(2);
    expect(useSceneStore.getState().starsVisible).toBe(true);
  });
});
