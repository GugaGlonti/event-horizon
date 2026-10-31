import { type ReactNode, useEffect, useRef } from 'react';
import type { ExplorationSession } from '@/features/exploration/ExplorationSession';
import { flightButtonClassName } from '@/features/flight/components/FlightMenu';
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
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#020711d9] p-3 backdrop-blur-md tablet:p-8">
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
        className="flex max-h-[calc(100svh-24px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cyan-100/15 bg-[#08111bf2] shadow-[0_24px_120px_#000a] tablet:max-h-[calc(100svh-64px)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-cyan-100/10 px-5 py-5 tablet:px-8 tablet:py-6">
          <div className="min-w-0">
            <p className="font-mono text-[9px] tracking-[0.24em] text-cyan-200/50">
              KESTREL / NAVIGATION ARCHIVE
            </p>
            <h2 id="map-title" className="mt-2 text-2xl font-light tracking-tight tablet:text-3xl">
              {view === 'galaxy' ? 'The charted reaches.' : 'A system to discover.'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close map"
            onClick={exploration.closeMap}
            className={`${flightButtonClassName} shrink-0`}
          >
            Close <span className="ml-2 text-slate-500">ESC</span>
          </button>
        </header>
        <fieldset
          className="flex min-w-0 shrink-0 gap-2 border-b border-white/5 px-5 py-3 tablet:px-8"
          aria-label="Map view"
        >
          <button
            type="button"
            aria-pressed={view === 'galaxy'}
            onClick={() => exploration.openMap('galaxy')}
            className={`${flightButtonClassName} aria-pressed:border-cyan-100/30 aria-pressed:text-cyan-100`}
          >
            Galaxy <kbd className="ml-2 opacity-40">M</kbd>
          </button>
          <button
            type="button"
            aria-pressed={view === 'local'}
            onClick={() => exploration.openMap('local')}
            className={`${flightButtonClassName} aria-pressed:border-cyan-100/30 aria-pressed:text-cyan-100`}
          >
            Local system <kbd className="ml-2 opacity-40">L</kbd>
          </button>
          <p className="my-auto ml-auto hidden font-mono text-[9px] tracking-widest text-slate-500 tablet:block">
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
