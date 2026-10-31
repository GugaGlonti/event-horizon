import { SYSTEMS } from '@/features/exploration/data/systems';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

const controls = [
  ['MOUSE', 'Pitch & yaw'],
  ['↑ / ↓', 'Nose down / up'],
  ['← / →', 'Roll left / right'],
  ['Q / E', 'Yaw left / right'],
  ['W', 'Raise throttle gradually'],
  ['S', 'Slow down / brake'],
  ['SHIFT', 'Engine boost'],
  ['SPACE', 'Reserved for weapons'],
  ['C', 'Chase / cockpit'],
  ['F', 'Flight assistance'],
  ['M / L', 'Galaxy / local map'],
  ['T / X', 'Cycle / clear target'],
  ['ESC', 'Pause & release mouse'],
] as const;

export const flightButtonClassName =
  'cursor-pointer rounded border border-white/15 bg-white/5 px-3 py-2 text-[10px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus motion-reduce:transition-none disabled:cursor-wait disabled:opacity-40';

export function FlightMenu({ session }: { session: FlightSession }) {
  const phase = useFlightStore((state) => state.phase);
  const ready = useFlightStore((state) => state.rendererReady);
  const notice = useFlightStore((state) => state.notice);
  const overlay = useExplorationStore((state) => state.overlay);
  const jumpPhase = useExplorationStore((state) => state.jump.phase);
  const systemId = useExplorationStore((state) => state.systemId);
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);
  if (phase === 'flying' || overlay || (jumpPhase !== 'IDLE' && jumpPhase !== 'COOLDOWN'))
    return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-space/35 p-5 backdrop-blur-[2px]">
      <section
        aria-labelledby="flight-menu-title"
        className="max-h-[calc(100svh-140px)] w-full max-w-md overflow-y-auto rounded-xl
          border border-teal-100/15 bg-[#0d141bf2] p-6 shadow-2xl tablet:p-8"
      >
        <p className="font-mono text-[9px] tracking-[0.2em] text-teal-200/65">
          KESTREL / EXPLORATION 03
        </p>
        <h2
          id="flight-menu-title"
          className="mt-3 text-3xl font-light tracking-tight text-stone-100"
        >
          {phase === 'ready' ? 'Take the controls.' : 'Flight paused.'}
        </h2>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          {phase === 'ready'
            ? 'Welcome to Solara. Pelagos is ahead; Lyra waits beyond. Open the throttle, choose a contact, and discover the charted reaches.'
            : `Your position and momentum are held in ${system?.name ?? 'the current system'}. Resume when you’re ready to fly.`}
        </p>
        <dl id="flight-controls" className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3">
          {controls.map(([key, action]) => (
            <div key={key}>
              <dt>
                <kbd className="font-mono text-[10px] text-stone-200">{key}</kbd>
              </dt>
              <dd className="mt-0.5 text-[10px] text-slate-400">{action}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[10px] leading-relaxed text-slate-500">
          Hold W to raise throttle; release to slow down. S applies stronger braking. Space is
          reserved for future weapons. Mouse steering recenters gently. Release Shift after boost
          depletion to rearm. Desktop keyboard required. Escape pauses flight.
        </p>
        {notice && (
          <p
            role="status"
            className="mt-4 rounded border border-amber-200/20 bg-amber-200/5 p-3 text-xs leading-relaxed text-amber-100"
          >
            {notice}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={session.startMouse}
            className={`${flightButtonClassName} border-teal-100/30 bg-teal-100/10 text-teal-100`}
          >
            {!ready
              ? 'Preparing flight deck…'
              : phase === 'ready'
                ? 'Fly with mouse'
                : 'Resume with mouse'}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={session.startKeyboard}
            className={flightButtonClassName}
          >
            Keyboard flight
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={session.reset}
            className={flightButtonClassName}
          >
            Reset flight
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={() => session.exploration.openMap('local')}
            className={flightButtonClassName}
          >
            Local system <kbd className="ml-2 text-slate-500">L</kbd>
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => session.exploration.openMap('galaxy')}
            className={flightButtonClassName}
          >
            Galaxy map <kbd className="ml-2 text-slate-500">M</kbd>
          </button>
        </div>
      </section>
    </div>
  );
}
