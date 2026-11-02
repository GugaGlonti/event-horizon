import { useRenderStatsStore } from '@/stores/renderStatsStore';

export function FpsCounter() {
  const fps = useRenderStatsStore((state) => state.fps);

  return (
    <dl
      aria-label="Rendering performance"
      className="ml-auto border-l border-line pl-3 text-[11px] tracking-wider"
    >
      <div className="flex items-baseline gap-1.5">
        <dt className="order-last text-phosphor-dim">
          <abbr title="Frames per second" className="no-underline">
            FPS
          </abbr>
        </dt>
        <dd className="min-w-7 text-right tabular-nums">{fps > 0 ? fps.toFixed(0) : '—'}</dd>
      </div>
    </dl>
  );
}
