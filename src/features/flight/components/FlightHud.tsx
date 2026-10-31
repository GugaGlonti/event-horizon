import { InstrumentButton } from '@/components/ui/InstrumentButton';
import { SegmentReadout } from '@/components/ui/SegmentReadout';
import { HyperspaceStatus } from '@/features/exploration/components/HyperspaceStatus';
import { NavigationHud, NavigationMarker } from '@/features/exploration/components/NavigationHud';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { FlightMenu } from '@/features/flight/components/FlightMenu';
import { ShipSchematic } from '@/features/flight/components/ShipSchematic';
import { FLIGHT_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

const gaugeSegments = Array.from({ length: 24 }, (_, position) => position);
const compassTicks = Array.from({ length: 25 }, (_, position) => position);

function Meter({ label, value, amber = false }: { label: string; value: number; amber?: boolean }) {
  return (
    <div className={amber ? 'text-instrument' : 'text-phosphor'}>
      <div className="mb-2 flex justify-between gap-3 text-[11px] font-bold tracking-wider">
        <span>{label}</span>
        <span>
          {Math.round(value * 100)
            .toString()
            .padStart(3, '0')}
          %
        </span>
      </div>
      <meter aria-label={label} value={value} min={0} max={1} className="sr-only" />
      <div aria-hidden="true" className="relative h-4 border border-current/40 p-0.5">
        <div className="flex h-full gap-0.5">
          {gaugeSegments.map((segment) => (
            <span
              key={segment}
              className={`h-full flex-1 bg-current ${value * 24 > segment ? 'opacity-90' : 'opacity-10'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const panelTitleClassName =
  'flex items-center justify-between border-b border-line px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-phosphor-dim';

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
  const heading = Math.round(telemetry.heading) % 360;

  return (
    <div className="phosphor-glow pointer-events-none absolute inset-0 font-mono uppercase text-phosphor">
      <header className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-3 border border-line bg-console/95 p-3 tablet:inset-x-6 tablet:top-5 tablet:flex-nowrap tablet:px-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-9 place-items-center border border-phosphor/60 text-lg font-bold"
          >
            EH
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-[0.18em] tablet:text-lg">Event Horizon</h1>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-phosphor-dim">
              Kestrel flight systems / MK.III
            </p>
          </div>
        </div>
        <div className="hidden text-right text-[11px] tracking-wider min-[1100px]:block">
          <p className="text-phosphor-dim">Sector 07 / charted reaches</p>
          <p className="mt-1 text-instrument">Local space : {system?.name}</p>
        </div>
        <nav
          aria-label="Flight panels"
          className="pointer-events-auto flex w-full gap-2 tablet:w-auto"
        >
          <InstrumentButton
            aria-label="Open local system map"
            disabled={!ready || busy}
            onClick={() => session.exploration.openMap('local')}
            className="min-w-0 flex-1 max-tablet:gap-1 max-tablet:px-1.5 max-tablet:text-[11px] tablet:flex-none"
          >
            <kbd className="text-instrument">L</kbd> System
          </InstrumentButton>
          <InstrumentButton
            aria-label="Open galaxy map"
            disabled={!ready || busy}
            onClick={() => session.exploration.openMap('galaxy')}
            className="min-w-0 flex-1 max-tablet:gap-1 max-tablet:px-1.5 max-tablet:text-[11px] tablet:flex-none"
          >
            <kbd className="text-instrument">M</kbd> Galaxy
          </InstrumentButton>
          <InstrumentButton
            onClick={session.pause}
            disabled={phase !== 'flying'}
            className="min-w-0 flex-1 max-tablet:gap-1 max-tablet:px-1.5 max-tablet:text-[11px] tablet:flex-none"
          >
            <kbd className="text-instrument">ESC</kbd> Controls
          </InstrumentButton>
        </nav>
      </header>

      {!busy && (
        <>
          <section
            aria-label="Orientation"
            className="absolute top-36 left-1/2 w-52 -translate-x-1/2 text-center tablet:top-28 tablet:w-72"
          >
            <div
              aria-hidden="true"
              className="flex justify-between border-x border-t border-phosphor/40 px-2 pt-1 text-[10px] text-phosphor-dim"
            >
              {[-60, -30, 0, 30, 60].map((offset) => (
                <span key={offset}>
                  {((heading + offset + 360) % 360).toString().padStart(3, '0')}
                </span>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="mt-1 flex justify-between border-b border-phosphor/40 px-3"
            >
              {compassTicks.map((tick) => (
                <span
                  key={tick}
                  className={`w-px bg-phosphor/50 ${tick % 6 === 0 ? 'h-2' : 'h-1'}`}
                />
              ))}
            </div>
            <div className="mx-auto mt-2 flex w-fit items-center gap-3 bg-console/75 px-3 py-2">
              <span className="text-[10px] tracking-widest">
                HDG
                <br />
                DEG
              </span>
              <SegmentReadout
                label="Heading"
                value={heading.toString().padStart(3, '0')}
                className="h-6 text-instrument"
              />
              <span className="text-[10px] text-phosphor-dim">
                PITCH
                <br />
                <span className="text-phosphor">
                  {telemetry.pitch >= 0 ? '+' : ''}
                  {Math.round(telemetry.pitch)}°
                </span>
              </span>
            </div>
          </section>
          <div
            aria-hidden="true"
            className="absolute top-[46%] left-1/2 -translate-1/2 text-phosphor/60"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 160 90"
              className="w-36 tablet:w-48"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
            >
              <path d="M12 20V8h25m86 0h25v12M12 70v12h25m86 0h25V70M0 45h42l8 6h20m20 0h20l8-6h42M80 24v10m0 28v8M73 45h14m-7-7v14" />
              <path d="M29 30h13m76 0h13M29 60h13m76 0h13" opacity="0.35" />
            </svg>
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-y-[29%] left-6 hidden w-3 border-y border-l border-line tablet:block"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-[29%] right-6 hidden w-3 border-y border-r border-line tablet:block"
          />

          <div className="absolute inset-x-3 bottom-14 grid grid-cols-2 gap-2 tablet:inset-x-6 tablet:grid-cols-[1fr_1.1fr_0.9fr_1.3fr]">
            <section aria-label="Flight telemetry" className="border border-line bg-console/95">
              <div className={panelTitleClassName}>
                <span>01 / velocity</span>
                <span>M·S⁻¹</span>
              </div>
              <div className="flex items-end gap-3 px-3 pt-3 pb-2 tablet:px-4">
                <SegmentReadout
                  label="Speed"
                  value={Math.round(telemetry.speed).toString().padStart(3, '0')}
                  className="h-10 text-instrument tablet:h-14"
                />
                <span className="pb-1 text-[10px] text-phosphor-dim">M/S</span>
              </div>
              <div className="flex justify-between gap-2 px-3 pb-3 text-[10px] text-phosphor-dim tablet:px-4">
                <span>CRS {FLIGHT_CONFIG.maxSpeed}</span>
                <span>MAX {FLIGHT_CONFIG.boostMaxSpeed}</span>
              </div>
            </section>
            <section aria-label="Ship systems" className="border border-line bg-console/95">
              <div className={panelTitleClassName}>
                <span>02 / propulsion</span>
                <span>{telemetry.boosting ? 'BST' : 'STD'}</span>
              </div>
              <div className="space-y-3 p-3">
                <Meter label="THROTTLE" value={telemetry.throttle} />
                <Meter label="BOOST" value={telemetry.boostCharge} amber={telemetry.boosting} />
              </div>
            </section>
            <section
              aria-label="Airframe configuration"
              className="hidden border border-line bg-console/95 tablet:block"
            >
              <div className={panelTitleClassName}>
                <span>03 / airframe</span>
                <span>K-01</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1">
                <ShipSchematic className="h-23 w-[55%] text-phosphor/80" />
                <dl className="space-y-3 text-[10px]">
                  <div>
                    <dt className="text-phosphor-dim">ASSIST</dt>
                    <dd className={assistance ? 'text-phosphor' : 'text-instrument'}>
                      {assistance ? 'ENGAGED' : 'MANUAL'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-phosphor-dim">BOOST</dt>
                    <dd className={telemetry.boosting ? 'text-instrument' : 'text-phosphor'}>
                      {telemetry.boosting ? 'ACTIVE' : telemetry.boostReady ? 'READY' : 'RECHARGE'}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
            <NavigationHud session={session} />
          </div>
          <NavigationMarker />
        </>
      )}
      <footer className="absolute inset-x-3 bottom-3 flex min-h-8 items-center justify-between gap-2 border-y border-line bg-console/95 px-2 text-[10px] font-bold tracking-wider tablet:inset-x-6 tablet:px-3">
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-1.5 ${busy ? 'bg-instrument' : 'bg-phosphor'}`}
          />
          <span>
            {busy ? 'Hyperdrive active' : phase === 'flying' ? 'Flight active' : 'Standby'}
          </span>
          <span className="hidden text-phosphor-dim min-[1100px]:inline">
            /{' '}
            {inputMode === 'mouse'
              ? 'MOUSE LINK'
              : inputMode === 'keyboard'
                ? 'KEYBOARD LINK'
                : 'AWAITING INPUT'}
          </span>
        </p>
        {busy ? (
          <InstrumentButton
            aria-label="Abort jump"
            onClick={() => session.exploration.cancelJump()}
            className="pointer-events-auto min-h-7 border-instrument/50 py-1 text-instrument"
          >
            ESC / Abort
          </InstrumentButton>
        ) : (
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              aria-label="Switch camera"
              onClick={toggleCamera}
              className="cursor-pointer px-1 py-2 hover:text-instrument focus-visible:outline-2 focus-visible:outline-focus"
            >
              <kbd className="text-instrument">C</kbd> / {cameraMode}
            </button>
            <button
              type="button"
              aria-label="Flight assistance"
              aria-pressed={assistance}
              onClick={toggleAssistance}
              className="cursor-pointer border-l border-line px-2 py-2 hover:text-instrument focus-visible:outline-2 focus-visible:outline-focus"
            >
              <kbd className="text-instrument">F</kbd> / ASSIST {assistance ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </footer>
      <HyperspaceStatus session={session} />
      <p id="scene-instructions" className="sr-only">
        Use mouse for pitch and yaw. Up arrow pitches the nose down; Down arrow pitches the nose up.
        Left and Right arrows roll left and right. Q and E yaw left and right. Hold W to gradually
        raise throttle; release to slow down. S applies stronger braking. Space is reserved for
        future weapons. Use Shift with W for boost, C for camera, F for assistance, and Escape to
        pause. M opens the galaxy map; L opens the local system map. T cycles navigation targets; X
        clears the target. Maps pause flight. Controls are available in the flight briefing.
      </p>
      <FlightMenu session={session} />
    </div>
  );
}
