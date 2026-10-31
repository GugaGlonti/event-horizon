import { type ReactNode, useEffect, useRef } from 'react';
import { instrumentButtonClassName } from '@/components/ui/InstrumentButton';
import type { ExplorationSession } from '@/features/exploration/ExplorationSession';
import type { MapView } from '@/stores/explorationStore';

export function MapDialog({
  view,
  exploration,
  children,
}: {
  view: MapView;
  exploration: ExplorationSession;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="phosphor-glow pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#020603e8] p-3 font-mono uppercase text-phosphor tablet:p-8">
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const elements =
            panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          const first = elements?.[0],
            last = elements?.[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        className="flex max-h-[calc(100svh-24px)] w-full max-w-6xl flex-col overflow-hidden border border-phosphor/60 bg-console shadow-[0_0_60px_#0009] tablet:max-h-[calc(100svh-64px)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-phosphor/60 bg-phosphor/5 px-5 py-5 tablet:px-8 tablet:py-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.24em] text-phosphor-dim">
              EH / Navigation computer
            </p>
            <h2
              id="map-title"
              className="mt-2 text-2xl font-bold tracking-[0.06em] tablet:text-3xl"
            >
              {view === 'galaxy' ? 'Galactic survey' : 'System survey'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close map"
            onClick={exploration.closeMap}
            className={`${instrumentButtonClassName} shrink-0`}
          >
            Close <span className="ml-2 text-phosphor-dim">ESC</span>
          </button>
        </header>
        <fieldset
          className="flex min-w-0 shrink-0 gap-2 border-b border-line px-5 py-3 tablet:px-8"
          aria-label="Map view"
        >
          <button
            type="button"
            aria-pressed={view === 'galaxy'}
            onClick={() => exploration.openMap('galaxy')}
            className={instrumentButtonClassName}
          >
            Galaxy <kbd className="ml-2 opacity-40">M</kbd>
          </button>
          <button
            type="button"
            aria-pressed={view === 'local'}
            onClick={() => exploration.openMap('local')}
            className={instrumentButtonClassName}
          >
            Local system <kbd className="ml-2 opacity-40">L</kbd>
          </button>
          <p className="my-auto ml-auto hidden font-mono text-[10px] tracking-widest text-phosphor-dim tablet:block">
            FLIGHT ON HOLD / UPLINK ACTIVE
          </p>
        </fieldset>
        <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
          {children}
        </div>
      </section>
    </div>
  );
}
