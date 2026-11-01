import { InstrumentButton } from '@/components/ui/InstrumentButton';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { ShipSchematic } from '@/features/flight/components/ShipSchematic';
import type { FlightSession } from '@/features/flight/FlightSession';
import { MultiplayerPanel } from '@/features/multiplayer/MultiplayerPanel';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

const controls = [
  ['W', 'Accelerate / release to coast'],
  ['S', 'Brake, then reverse at zero throttle'],
  ['↑ / ↓', 'Nose down / up'],
  ['← / →', 'Roll left / right'],
  ['Q / E', 'Yaw left / right'],
  ['MOUSE', 'Pitch & yaw'],
  ['SHIFT + W', 'Engine boost'],
  ['MOUSE / SPACE', 'Fire selected weapon'],
  ['1 / 2 / 3 / 4', 'Gun / missiles / railgun / flak'],
  ['A / D', 'Strafe left / right'],
  ['R / V', 'Up / down; release to coast near planets'],
  ['B / N', 'Start patrol / cycle hostile'],
  ['G / H', 'Nearest hostile ahead / clear'],
  ['TAB', 'Cycle hostile while flying'],
  ['C / F', 'Camera / stabilization (independent of speed mode)'],
  ['M / L', 'Galaxy / local chart'],
  ['T / X', 'Cycle / clear contact'],
  ['K / U', 'Landing gear / takeoff or undock'],
  ['P / I', 'Request or capture docking / cancel'],
  ['O', 'Toggle bounded space transit'],
  ['J', 'Land assist at selected zone / cancel'],
  ['ESC', 'Pause / release mouse'],
] as const;

export function FlightMenu({ session }: { session: FlightSession }) {
  const hostiles = useCombatStore((state) => state.readout.hostiles);
  const dead = useCombatStore((state) => state.readout.dead);
  const sound = useCombatStore((state) => state.sound);
  const phase = useFlightStore((state) => state.phase);
  const ready = useFlightStore((state) => state.rendererReady);
  const notice = useFlightStore((state) => state.notice);
  const assistance = useFlightStore((state) => state.assistance);
  const engineSound = useFlightStore((state) => state.engineSound);
  const overlay = useExplorationStore((state) => state.overlay);
  const jumpPhase = useExplorationStore((state) => state.jump.phase);
  const systemId = useExplorationStore((state) => state.systemId);
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);
  if (dead || phase === 'flying' || overlay || (jumpPhase !== 'IDLE' && jumpPhase !== 'COOLDOWN'))
    return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-[#020603a6] p-3 tablet:p-8">
      <section
        aria-labelledby="flight-menu-title"
        className="max-h-[calc(100svh-24px)] w-full max-w-4xl overflow-y-auto border border-phosphor/65 bg-console shadow-[0_0_40px_#0009]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-phosphor/65 bg-phosphor/10 px-4 py-2 text-[11px] font-bold tracking-[0.1em] tablet:px-6">
          <span>EH / Pilot interface</span>
          <span className="text-instrument">
            {phase === 'ready' ? 'Input required' : 'Flight suspended'}
          </span>
        </header>
        <div className="grid tablet:grid-cols-[0.8fr_1.6fr]">
          <aside
            className="crt-grid flex items-center gap-4 border-b border-line p-4 tablet:flex-col tablet:items-stretch tablet:gap-0 tablet:border-r tablet:border-b-0 tablet:p-6"
            aria-label="Ship configuration"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-[0.18em] text-phosphor-dim">
                Single-seat starfighter
              </p>
              <p className="mt-1 text-3xl font-bold tracking-[0.12em] tablet:mt-3 tablet:text-4xl">
                Kestrel
              </p>
              <p className="mt-2 text-[11px] tracking-[0.12em] text-instrument">
                KST — 01 / FLIGHT SYSTEM
              </p>
            </div>
            <ShipSchematic className="h-25 w-28 shrink-0 text-phosphor tablet:my-7 tablet:h-auto tablet:w-full" />
            <dl className="hidden space-y-4 border-t border-line pt-5 text-[11px] tablet:block">
              <div className="flex justify-between">
                <dt className="text-phosphor-dim">LOCAL SPACE</dt>
                <dd>{system?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-phosphor-dim">ASSISTANCE</dt>
                <dd>{assistance ? 'ENGAGED' : 'MANUAL'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-phosphor-dim">HYPERDRIVE</dt>
                <dd>{jumpPhase === 'COOLDOWN' ? 'COOLING' : 'STANDBY'}</dd>
              </div>
            </dl>
            <div aria-hidden="true" className="mt-auto hidden pt-8 tablet:block">
              <div className="instrument-hatch h-2 text-phosphor/45" />
              <p className="mt-3 text-[10px] tracking-[0.18em] text-phosphor-dim">
                Combat program / 04
              </p>
            </div>
          </aside>
          <div className="flex flex-col p-4 tablet:p-6">
            <p className="text-[10px] tracking-[0.18em] text-phosphor-dim">
              Command terminal / manual control
            </p>
            <h2
              id="flight-menu-title"
              className="mt-3 text-2xl font-bold tracking-[0.06em] tablet:text-3xl"
            >
              {phase === 'ready' ? 'Awaiting pilot.' : 'Flight paused.'}
            </h2>
            <p className="mt-3 max-w-lg text-[12px] leading-5 normal-case text-phosphor-dim">
              {phase === 'ready'
                ? `Welcome to ${system?.name ?? 'Solara'}. Orbital patrols arrive after eight seconds of flight. K deploys landing gear; P requests nearby docking. Choose Practice target for a stationary contact, or consult the charts to plot a jump.`
                : `Controls suspended in ${system?.name ?? 'the current system'}. Select an input mode to resume flight.`}
            </p>
            <MultiplayerPanel session={session} />
            <div className="order-2 mt-5 flex justify-between border-b border-line pb-2 text-[10px] tracking-widest tablet:order-none">
              <span>Control reference</span>
              <span className="text-phosphor-dim">DESKTOP / KEYBOARD</span>
            </div>
            <dl
              id="flight-controls"
              className="order-2 mt-1 grid grid-cols-1 min-[480px]:grid-cols-2 min-[480px]:gap-x-5 tablet:order-none"
            >
              {controls.map(([key, action]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 border-b border-line/55 py-2.5 text-[11px] min-[480px]:items-start min-[480px]:justify-start"
                >
                  <dt className="w-19 shrink-0 font-bold text-instrument">
                    <kbd>{key}</kbd>
                  </dt>
                  <dd className="text-right normal-case text-phosphor-dim min-[480px]:text-left">
                    {action}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="order-2 mt-4 border-l-2 border-instrument/70 pl-3 text-[11px] leading-5 normal-case text-phosphor-dim tablet:order-none">
              Hold W to build throttle. Release W to slow down; hold S to brake, then reverse once
              throttle reaches zero. Mouse steering recenters gently. Release Shift after boost
              depletion to rearm. Hold Space to charge the railgun; releasing early cancels.
            </p>
            {notice && (
              <p
                role="status"
                className="mt-4 border border-instrument/50 bg-instrument/5 p-3 text-[12px] leading-5 normal-case text-instrument"
              >
                {notice}
              </p>
            )}
            <div className="mt-5 grid gap-2 min-[480px]:grid-cols-2">
              <InstrumentButton primary disabled={!ready} onClick={session.startKeyboard}>
                {ready ? 'Keyboard flight' : 'Preparing flight deck…'}
              </InstrumentButton>
              <InstrumentButton disabled={!ready} onClick={session.startMouse}>
                {phase === 'ready' ? 'Fly with mouse' : 'Resume with mouse'}
              </InstrumentButton>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <InstrumentButton
                disabled={!ready || (!session.multiplayer.enabled && hostiles > 0)}
                className="flex-1"
                onClick={() => {
                  session.startEncounter(true);
                  session.startKeyboard();
                }}
              >
                Practice target
              </InstrumentButton>
              <InstrumentButton
                disabled={!ready || (!session.multiplayer.enabled && hostiles > 0)}
                className="flex-1"
                onClick={() => {
                  session.startEncounter();
                  session.startKeyboard();
                }}
              >
                Engage patrol / B
              </InstrumentButton>
              <InstrumentButton
                aria-pressed={sound}
                onClick={() => {
                  useCombatStore.setState({ sound: !sound });
                  if (sound) session.combat.audio.stop();
                }}
              >
                Combat audio {sound ? 'on' : 'off'}
              </InstrumentButton>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <InstrumentButton aria-pressed={engineSound} onClick={session.toggleEngineSound}>
                Engine audio {engineSound ? 'on' : 'off'}
              </InstrumentButton>
              <InstrumentButton
                disabled={!ready}
                onClick={() => session.exploration.openMap('local')}
                className="flex-1"
              >
                <kbd className="text-instrument">L</kbd> Local system
              </InstrumentButton>
              <InstrumentButton
                disabled={!ready}
                onClick={() => session.exploration.openMap('galaxy')}
                className="flex-1"
              >
                <kbd className="text-instrument">M</kbd> Galaxy map
              </InstrumentButton>
              <InstrumentButton
                disabled={!ready}
                onClick={session.reset}
                className="text-phosphor-dim"
              >
                Reset flight
              </InstrumentButton>
            </div>
          </div>
        </div>
        <footer className="flex justify-between gap-3 border-t border-line px-4 py-2 text-[10px] tracking-wider text-phosphor-dim tablet:px-6">
          <span>Event Horizon / onboard computer</span>
          <span className="hidden min-[480px]:inline">
            {ready ? 'Ready for departure' : 'Initializing'}
          </span>
        </footer>
      </section>
    </div>
  );
}
