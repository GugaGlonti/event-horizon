import { Icon } from '@/components/ui/Icon';
import { useRotationEnabled } from '@/hooks/useRotationEnabled';
import { useSceneStore } from '@/stores/sceneStore';

const buttonClassName = [
  'inline-flex min-h-[42px] min-w-[76px] flex-1 cursor-pointer items-center justify-center',
  'gap-[9px] rounded border-0 bg-transparent px-[9px] text-[11px] whitespace-nowrap text-[#b3bac4]',
  'transition-[color,background] duration-160 hover:bg-[#e9e6e00c] hover:text-[#eee9e0]',
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus',
  'focus-visible:outline-offset-5 motion-reduce:transition-none',
  'max-[380px]:gap-[7px] max-[380px]:px-[7px]',
  'tablet:min-h-10 tablet:min-w-22 tablet:flex-none tablet:px-3',
].join(' ');

export function SceneToolbar() {
  const rotationEnabled = useRotationEnabled();
  const starsVisible = useSceneStore((state) => state.starsVisible);
  const setRotationEnabled = useSceneStore((state) => state.setRotationEnabled);
  const toggleStars = useSceneStore((state) => state.toggleStars);
  const resetView = useSceneStore((state) => state.resetView);

  return (
    <fieldset
      className="flex w-full max-w-[360px] items-center gap-[5px] rounded-lg border
        border-[#b5bec624] bg-[#10141bb8] p-[5px] backdrop-blur-lg tablet:w-auto tablet:max-w-none"
      aria-label="Scene controls"
    >
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setRotationEnabled(!rotationEnabled)}
        aria-pressed={!rotationEnabled}
        aria-label="Pause rotation"
        title={rotationEnabled ? 'Pause rotation' : 'Resume rotation'}
      >
        <Icon name={rotationEnabled ? 'pause' : 'play'} />
        <span>{rotationEnabled ? 'Pause' : 'Resume'}</span>
      </button>
      <span className="h-[15px] w-px bg-[#c5c9d21c]" />
      <button
        type="button"
        className={`${buttonClassName} aria-[pressed=false]:text-[#6e7784]`}
        onClick={toggleStars}
        aria-pressed={starsVisible}
        aria-label="Show stars"
        title={starsVisible ? 'Hide stars' : 'Show stars'}
      >
        <Icon name="stars" />
        <span>Stars</span>
      </button>
      <span className="h-[15px] w-px bg-[#c5c9d21c]" />
      <button
        type="button"
        className={buttonClassName}
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
