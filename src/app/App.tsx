import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SceneErrorBoundary } from '@/app/SceneErrorBoundary';
import { SceneMessage } from '@/components/ui/SceneMessage';
import { ExplorationOverlay } from '@/features/exploration/components/ExplorationOverlay';
import { FlightHud } from '@/features/flight/components/FlightHud';
import { FlightSession } from '@/features/flight/FlightSession';

const SpaceScene = lazy(() => import('@/features/space/components/SpaceScene'));

export function App() {
  const viewport = useRef<HTMLElement>(null);
  const [session] = useState(() => new FlightSession());

  useEffect(() => {
    if (viewport.current) return session.attach(viewport.current);
  }, [session]);

  return (
    <main
      ref={viewport}
      tabIndex={-1}
      aria-label="Event Horizon flight simulator"
      className="relative isolate h-svh min-h-[560px] w-full overflow-hidden bg-space outline-none"
    >
      <SceneErrorBoundary onError={session.rendererFailed}>
        <div className="absolute inset-0 -z-2">
          <Suspense
            fallback={
              <SceneMessage title="Preparing the flight deck…">
                Plotting a course through Solara.
              </SceneMessage>
            }
          >
            <SpaceScene session={session} />
          </Suspense>
        </div>
        <div
          className="pointer-events-none absolute inset-0 -z-1 bg-vignette shadow-vignette"
          aria-hidden="true"
        />
        <FlightHud session={session} />
        <ExplorationOverlay session={session} />
      </SceneErrorBoundary>
    </main>
  );
}
