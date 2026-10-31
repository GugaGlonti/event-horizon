import { Icon } from '@/components/ui/Icon';
import { HyperspaceStatus } from '@/features/exploration/components/HyperspaceStatus';
import { NavigationHud } from '@/features/exploration/components/NavigationHud';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { FlightMenu, flightButtonClassName } from '@/features/flight/components/FlightMenu';
import { FLIGHT_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

function Meter({
  label,
  value,
  color = 'bg-teal-100/65',
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between gap-5 font-mono text-[9px] text-slate-400">
        <span>{label}</span>
        <span className="text-stone-200">{Math.round(value * 100)}%</span>
      </div>
      <meter aria-label={label} value={value} min={0} max={1} className="sr-only" />
      <div aria-hidden="true" className="mt-2 h-0.5 overflow-hidden bg-white/10">
        <div className={`h-full origin-left ${color}`} style={{ transform: `scaleX(${value})` }} />
      </div>
    </div>
  );
}

export function FlightHud({ session }: { session: FlightSession }) {
  const telemetry = useFlightStore((state) => state.telemetry);
  const phase = useFlightStore((state) => state.phase);
  const cameraMode = useFlightStore((state) => state.cameraMode);
  const assistance = useFlightStore((state) => state.assistance);
  const inputMode = useFlightStore((state) => state.inputMode);
  const toggleCamera = useFlightStore((state) => state.toggleCamera);
  const toggleAssistance = useFlightStore((state) => state.toggleAssistance);
  const ready = useFlightStore((state) => state.rendererReady);
  const systemId = useExplorationStore((state) => state.systemId);
  const jumpPhase = useExplorationStore((state) => state.jump.phase);
  const busy = jumpPhase !== 'IDLE' && jumpPhase !== 'COOLDOWN';
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      <header className="absolute inset-x-5 top-6 flex items-center justify-between gap-4 tablet:inset-x-10 tablet:top-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full border border-stone-200/15 text-stone-300">
            <Icon name="orbit" className="size-6" />
          </span>
          <div>
            <h1 className="text-[10px] font-medium tracking-[0.22em] tablet:text-xs">
              EVENT HORIZON
            </h1>
            <p className="mt-1 font-mono text-[8px] tracking-[0.15em] text-slate-400">
              {system?.name.toUpperCase()} / CHARTED REACHES
            </p>
          </div>
        </div>
        <div className="pointer-events-auto flex gap-1.5 tablet:gap-2">
          <button
            type="button"
            aria-label="Open local system map"
            disabled={!ready || busy}
            onClick={() => session.exploration.openMap('local')}
            className={flightButtonClassName}
          >
            <span className="mr-2 hidden tablet:inline">System</span>
            <kbd>L</kbd>
          </button>
          <button
            type="button"
            aria-label="Open galaxy map"
            disabled={!ready || busy}
            onClick={() => session.exploration.openMap('galaxy')}
            className={flightButtonClassName}
          >
            <span className="mr-2 hidden tablet:inline">Galaxy</span>
            <kbd>M</kbd>
          </button>
          <button
            type="button"
            onClick={session.pause}
            disabled={phase !== 'flying'}
            className={`pointer-events-auto ${flightButtonClassName}`}
          >
            Controls <span className="ml-2 hidden text-slate-500 tablet:inline">ESC</span>
          </button>
        </div>
      </header>

      <div className={busy ? 'hidden' : 'contents'} aria-hidden={busy}>
        <div className="absolute top-24 left-1/2 -translate-x-1/2 text-center font-mono tablet:top-9">
          <p className="text-[8px] tracking-[0.3em] text-slate-500">HEADING</p>
          <output
            className="mt-1 block text-lg tracking-[0.16em] text-teal-100/80"
            aria-label="Heading"
            aria-live="off"
          >
            {Math.round(telemetry.heading).toString().padStart(3, '0')}
            <span className="text-xs">°</span>
          </output>
          <p className="mt-1 text-[8px] tracking-widest text-slate-500">
            PITCH {telemetry.pitch >= 0 ? '+' : ''}
            {Math.round(telemetry.pitch)}°
          </p>
        </div>

        <div
          className="absolute top-1/2 left-1/2 -translate-1/2 text-teal-100/60"
          aria-hidden="true"
        >
          <svg
            aria-hidden="true"
            width="72"
            height="72"
            viewBox="0 0 72 72"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <circle cx="36" cy="36" r="18" strokeOpacity="0.4" />
            <path d="M36 8v10M36 54v10M8 36h10M54 36h10" />
            <circle cx="36" cy="36" r="1.5" fill="currentColor" />
          </svg>
        </div>

        <section
          aria-label="Flight telemetry"
          className="absolute bottom-24 left-5 w-32 tablet:bottom-28 tablet:left-10 tablet:w-48"
        >
          <p className="font-mono text-[8px] tracking-[0.18em] text-slate-400">VELOCITY / M·S⁻¹</p>
          <output
            className="mt-1 block font-mono text-4xl font-light tracking-tight text-stone-100 tablet:text-5xl"
            aria-label="Speed"
            aria-live="off"
          >
            {Math.round(telemetry.speed).toString().padStart(3, '0')}
          </output>
          <Meter label="THROTTLE" value={telemetry.throttle} />
          <p className="mt-3 hidden font-mono text-[8px] tracking-widest text-slate-500 tablet:block">
            CRUISE {FLIGHT_CONFIG.maxSpeed} / BOOST {FLIGHT_CONFIG.boostMaxSpeed}
          </p>
        </section>

        <section
          aria-label="Ship systems"
          className="absolute right-5 bottom-24 w-32 text-right tablet:right-10 tablet:bottom-28 tablet:w-48"
        >
          <p
            className={`font-mono text-[9px] tracking-[0.14em] ${telemetry.boosting ? 'text-amber-200' : 'text-slate-400'}`}
          >
            {telemetry.boosting
              ? 'BOOST ACTIVE'
              : telemetry.boostReady
                ? 'BOOST READY'
                : 'RECHARGING'}
          </p>
          <Meter
            label="BOOST"
            value={telemetry.boostCharge}
            color={telemetry.boosting ? 'bg-amber-200' : 'bg-teal-100/65'}
          />
          <p className="mt-4 font-mono text-[9px] text-slate-400">
            FLIGHT ASSIST{' '}
            <span className={assistance ? 'text-teal-100' : 'text-amber-200'}>
              {assistance ? 'ON' : 'OFF'}
            </span>
          </p>
          <p className="mt-2 font-mono text-[9px] uppercase text-slate-500">{cameraMode} camera</p>
        </section>
      </div>
      <footer className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 tablet:inset-x-10 tablet:bottom-7">
        <p className="font-mono text-[8px] tracking-[0.1em] text-slate-500">
          <span className="text-teal-100/70">
            {busy ? 'HYPERDRIVE ACTIVE' : phase === 'flying' ? 'FLIGHT ACTIVE' : 'STANDBY'}
          </span>
          {busy && (
            <button
              type="button"
              aria-label="Abort jump"
              onClick={() => session.exploration.cancelJump()}
              className="pointer-events-auto ml-3 cursor-pointer text-slate-400 hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-focus"
            >
              ESC · ABORT
            </button>
          )}
          <span className={busy ? 'hidden' : 'ml-3 hidden tablet:inline'}>
            {inputMode === 'mouse'
              ? 'MOUSE CAPTURED'
              : inputMode === 'keyboard'
                ? 'KEYBOARD CONTROL'
                : 'KESTREL / 01'}
          </span>
        </p>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={toggleCamera}
            className={flightButtonClassName}
            aria-label="Switch camera"
          >
            <span className="mr-2 text-slate-500">C</span>
            <span className="capitalize">{cameraMode}</span>
          </button>
          <button
            type="button"
            onClick={toggleAssistance}
            className={flightButtonClassName}
            aria-pressed={assistance}
            aria-label="Flight assistance"
          >
            <span className="mr-2 text-slate-500">F</span>Assist {assistance ? 'on' : 'off'}
          </button>
        </div>
      </footer>
      <NavigationHud session={session} />
      <HyperspaceStatus session={session} />
      <p id="scene-instructions" className="sr-only">
        Use mouse for pitch and yaw. Up arrow pitches the nose down; Down arrow pitches the nose up.
        Left and Right arrows roll left and right. Q and E yaw left and right. Hold W to gradually
        raise throttle; release to slow down. S applies stronger braking. Space is reserved for
        future weapons. Use Shift for boost, C for camera, F for assistance, and Escape to pause. M
        opens the galaxy map; L opens the local system map. T cycles navigation targets; X clears
        the target. Maps pause flight. Controls are available in the flight briefing.
      </p>
      <FlightMenu session={session} />
    </div>
  );
}
