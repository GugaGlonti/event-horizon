import { lazy, Suspense } from 'react';
import { SceneErrorBoundary } from '@/app/SceneErrorBoundary';
import { Icon } from '@/components/ui/Icon';
import { SceneMessage } from '@/components/ui/SceneMessage';
import { SceneToolbar } from '@/features/space/components/SceneToolbar';

const SpaceScene = lazy(() => import('@/features/space/components/SpaceScene'));

export function App() {
  return (
    <main className="relative isolate h-svh min-h-[560px] w-full overflow-hidden bg-space short-mobile:min-h-[600px]">
      <div className="absolute inset-0 -z-2 cursor-grab touch-none active:cursor-grabbing">
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

      <div
        className="pointer-events-none absolute inset-0 -z-1 bg-vignette shadow-vignette"
        aria-hidden="true"
      />

      <header
        className="pointer-events-none absolute inset-x-6 top-[max(24px,env(safe-area-inset-top))]
          flex items-center justify-between tablet:inset-x-12
          tablet:top-[max(36px,env(safe-area-inset-top))] wide:inset-x-16"
      >
        <div className="flex items-center gap-3 tablet:gap-[17px]">
          <span
            className="grid size-[38px] place-items-center rounded-full border border-[#ede5da20]
              text-[#d7c8b5] tablet:size-11"
          >
            <Icon name="orbit" className="size-7" />
          </span>
          <div>
            <h1 className="text-[10px] font-medium tracking-[0.18em] tablet:text-xs tablet:tracking-[0.23em]">
              EVENT HORIZON
            </h1>
            <p className="mt-[7px] font-mono text-[7px] tracking-[0.2em] text-[#81878f] tablet:text-[8px]">
              BEYOND THE FAMILIAR
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 font-mono text-[8px] tracking-[0.08em] text-[#b3bbc3] tablet:text-[9px]">
          <span className="size-[5px] rounded-full bg-[#a3bdab] shadow-[0_0_10px_#a3bdab30]" />
          <span>
            FOUNDATION <span className="hidden text-slate-500 tablet:inline">/ 0.1.0</span>
          </span>
        </div>
      </header>

      <div
        className="pointer-events-none absolute top-[105px] left-6 flex items-center gap-3
          font-mono text-[8px] tracking-[0.09em] text-[#9098a3]
          tablet:top-[142px] tablet:left-12 tablet:text-[9px] wide:left-16"
        aria-hidden="true"
      >
        <span className="h-px w-6 bg-[#9da6b366]" />
        <span>
          01 <span className="mx-2 text-slate-600">/</span> ORBITAL OBSERVATORY
        </span>
      </div>

      <section
        className="pointer-events-none absolute bottom-[166px] left-6 tablet:bottom-[114px]
          tablet:left-12 wide:left-16 short-mobile:bottom-[150px] short-desktop:bottom-[90px]"
        aria-label="About the scene"
      >
        <p className="font-mono text-[9px] leading-[1.6] tracking-[0.14em] text-subtle">
          <span className="text-stone-400">EH—001</span> / REFERENCE WORLD
        </p>
        <h2
          className="mt-1.5 text-[clamp(44px,4.6vw,72px)] leading-[1.1] font-light
            tracking-[-0.055em] tablet:mt-3 short-mobile:text-[38px] short-desktop:text-[44px]"
        >
          Aster<span className="text-stone-500">.</span>
        </h2>
        <p className="mt-2 text-[11px] leading-[1.6] text-[#9299a3] tablet:mt-4 tablet:text-xs short-mobile:hidden">
          Every journey begins with a new perspective.
        </p>
        <div
          className="mt-[23px] hidden items-center gap-2.5 font-mono text-[8px]
            tracking-[0.08em] text-[#69737f] tablet:flex short-desktop:hidden"
        >
          <span>RINGED WORLD</span>
          <span className="size-0.5 rounded-full bg-[#69737f]" />
          <span>ARTIST’S STUDY</span>
        </div>
      </section>

      <div
        className="absolute right-6 bottom-[76px] left-6 flex items-center justify-end gap-[18px]
          tablet:right-12 tablet:bottom-[114px] tablet:left-auto tablet:block wide:right-16
          short-desktop:bottom-[90px]"
      >
        <div
          id="scene-instructions"
          className="pointer-events-none mb-[18px] hidden justify-end gap-[18px]
            text-[10px] text-[#848d99] tablet:flex"
        >
          <span className="flex items-center gap-[7px]">
            <Icon name="orbit" className="size-3.5 text-[#65707d]" /> Drag to orbit
          </span>
          <span className="flex items-center gap-[7px]">
            <Icon name="scroll" className="size-3.5 text-[#65707d]" /> Scroll or pinch to zoom
          </span>
        </div>
        <SceneToolbar />
      </div>

      <footer
        className="pointer-events-none absolute inset-x-6 bottom-[max(24px,env(safe-area-inset-bottom))]
          flex justify-between gap-3 border-t border-[#c5c9d21a] pt-[15px]
          font-mono text-[7px] tracking-[0.11em] text-[#68717d] tablet:inset-x-12
          tablet:bottom-[max(30px,env(safe-area-inset-bottom))] tablet:pt-5 tablet:text-[8px]
          wide:inset-x-16"
      >
        <p>A FOUNDATION FOR THE UNKNOWN.</p>
        <p className="hidden tablet:block">
          <span className="text-stone-400">PHASE 01</span>
          <span className="mx-3 text-slate-600">/</span>THE BEGINNING
        </p>
      </footer>
    </main>
  );
}
