import { lazy, Suspense } from 'react';
import { SceneErrorBoundary } from '@/app/SceneErrorBoundary';
import { Icon } from '@/components/ui/Icon';
import { SceneMessage } from '@/components/ui/SceneMessage';
import { SceneToolbar } from '@/features/space/components/SceneToolbar';

const SpaceScene = lazy(() => import('@/features/space/components/SpaceScene'));

export function App() {
  return (
    <main className="observatory">
      <div className="scene-viewport">
        <SceneErrorBoundary>
          <Suspense
            fallback={
              <SceneMessage title="Opening the observatory…">
                Preparing a little piece of space.
              </SceneMessage>
            }
          >
            <SpaceScene />
          </Suspense>
        </SceneErrorBoundary>
      </div>

      <div className="scene-vignette" aria-hidden="true" />

      <header className="observatory-header">
        <div className="brand">
          <span className="brand-symbol">
            <Icon name="orbit" />
          </span>
          <div>
            <h1>EVENT HORIZON</h1>
            <p>BEYOND THE FAMILIAR</p>
          </div>
        </div>
        <div className="build-status">
          <span className="status-dot" />
          <span>
            FOUNDATION <span className="text-slate-500">/ 0.1.0</span>
          </span>
        </div>
      </header>

      <div className="scene-label" aria-hidden="true">
        <span className="label-line" />
        <span>
          01 <span className="mx-2 text-slate-600">/</span> ORBITAL OBSERVATORY
        </span>
      </div>

      <section className="object-caption" aria-label="About the scene">
        <p className="eyebrow">
          <span className="text-stone-400">EH—001</span> / REFERENCE WORLD
        </p>
        <h2>
          Aster<span className="text-stone-500">.</span>
        </h2>
        <p className="caption-description">Every journey begins with a new perspective.</p>
        <div className="object-tags">
          <span>RINGED WORLD</span>
          <span className="tag-dot" />
          <span>ARTIST’S STUDY</span>
        </div>
      </section>

      <div className="scene-navigation">
        <div id="scene-instructions" className="scene-instructions">
          <span>
            <Icon name="orbit" /> Drag to orbit
          </span>
          <span>
            <Icon name="scroll" /> Scroll or pinch to zoom
          </span>
        </div>
        <SceneToolbar />
      </div>

      <footer className="observatory-footer">
        <p>A FOUNDATION FOR THE UNKNOWN.</p>
        <p>
          <span className="text-stone-400">PHASE 01</span>
          <span className="mx-3 text-slate-600">/</span>THE BEGINNING
        </p>
      </footer>
    </main>
  );
}
