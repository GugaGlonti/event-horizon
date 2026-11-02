import { InstrumentButton } from '@/components/ui/InstrumentButton';
import { SegmentReadout } from '@/components/ui/SegmentReadout';
import { PLANETARY_FLIGHT_CONFIG } from '@/engine/planetary/config';
import { CombatHud } from '@/features/combat/components/CombatHud';
import { HyperspaceStatus } from '@/features/exploration/components/HyperspaceStatus';
import { NavigationHud, NavigationMarker } from '@/features/exploration/components/NavigationHud';
import { NearbyPlanetMarkers } from '@/features/exploration/components/NearbyPlanetMarkers';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { FlightMenu } from '@/features/flight/components/FlightMenu';
import { FpsCounter } from '@/features/flight/components/FpsCounter';
import { ShipSchematic } from '@/features/flight/components/ShipSchematic';
import { SpeedTrendIndicator } from '@/features/flight/components/SpeedTrendIndicator';
import { FLIGHT_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { PlanetaryHud } from '@/features/planets/PlanetaryHud';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';
import { usePlanetaryStore } from '@/stores/planetaryStore';

const gaugeSegments = Array.from({ length: 24 }, (_, position) => position);
const compassTicks = Array.from({ length: 25 }, (_, position) => position);

function Meter({
  label,
  value,
  amber = false,
  compact = false,
}: {
  label: string;
  value: number;
  amber?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={amber ? 'text-instrument' : 'text-phosphor'}>
      <div className="mb-1.5 flex justify-between gap-3 text-[11px] tracking-wider">
        <span>{label}</span>
        <span>
          {Math.round(value * 100)
            .toString()
            .padStart(3, '0')}
          %
        </span>
      </div>
      <meter aria-label={label} value={value} min={0} max={1} className="sr-only" />
      <div aria-hidden="true" className={`relative ${compact ? 'h-1.5' : 'h-3'}`}>
        <div className="flex h-full gap-1">
          {gaugeSegments.map((segment) => (
            <span
              key={segment}
              className={`h-full flex-1 bg-current motion-safe:transition-opacity motion-safe:duration-150 ${value * 24 > segment ? 'opacity-90' : 'opacity-10'}`}
            />
          ))}
        </div>
        <span
          className="absolute -bottom-1 h-0.5 w-1.5 -translate-x-full bg-current motion-safe:transition-[left] motion-safe:duration-150 motion-safe:ease-linear"
          style={{ left: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
    </div>
  );
}

const instrumentTitleClassName =
  "mb-3 flex items-center gap-2 text-[10px] tracking-[0.16em] text-phosphor-dim before:h-px before:w-4 before:bg-phosphor/50 before:content-['']";

export function FlightHud({ session }: { session: FlightSession }) {
  const dead = useCombatStore((state) => state.readout.dead);
  const telemetry = useFlightStore((state) => state.telemetry);
  const speedTrend = useFlightStore((state) => state.speedTrend);
  const phase = useFlightStore((state) => state.phase);
  const cameraMode = useFlightStore((state) => state.cameraMode);
  const assistance = useFlightStore((state) => state.assistance);
  const inputMode = useFlightStore((state) => state.inputMode);
  const toggleCamera = useFlightStore((state) => state.toggleCamera);
  const toggleAssistance = useFlightStore((state) => state.toggleAssistance);
  const ready = useFlightStore((state) => state.rendererReady);
  const systemId = useExplorationStore((state) => state.systemId);
  const jumpPhase = useExplorationStore((state) => state.jump.phase);
  const travelMode = usePlanetaryStore((state) => state.readout?.travelMode ?? 'normal');
  const altitude = usePlanetaryStore((state) => state.readout?.altitude ?? Infinity);
  const descentLimit = usePlanetaryStore((state) => state.readout?.descentLimit ?? 0);
  const speedRange =
    travelMode === 'surface'
      ? Math.max(FLIGHT_CONFIG.boostMaxSpeed, descentLimit)
      : travelMode === 'transit'
        ? altitude < 60000
          ? PLANETARY_FLIGHT_CONFIG.approachMaxSpeed
          : FLIGHT_CONFIG.boostMaxSpeed * PLANETARY_FLIGHT_CONFIG.transitMultiplier
        : FLIGHT_CONFIG.boostMaxSpeed;
  const busy = jumpPhase !== 'IDLE' && jumpPhase !== 'COOLDOWN';
  const active = phase === 'flying' && !busy && !dead;
  const system = SYSTEMS.find((candidate) => candidate.id === systemId);
  const heading = Math.round(telemetry.heading) % 360;

  return (
    <div className="phosphor-glow pointer-events-none absolute inset-0 font-mono uppercase text-phosphor">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-space/15 via-space/5 to-transparent tablet:h-32"
      />
      <header className="absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 tablet:inset-x-8 tablet:top-6 tablet:flex-nowrap">
        <div className="flex w-full items-center gap-3 tablet:w-auto">
          <div
            aria-hidden="true"
            className="border-r border-line pr-3 text-base tracking-tighter text-phosphor/60"
          >
            EH
          </div>
          <div>
            <h1 className="text-sm tracking-[0.22em]">Event Horizon</h1>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-phosphor-dim">
              Kestrel flight systems / MK.VII
            </p>
          </div>
          <FpsCounter />
        </div>
        <div className="hidden text-right text-[11px] tracking-wider min-[1100px]:block">
          <p className="text-[10px] text-phosphor-dim">Sector 07 / charted reaches</p>
          <p className="mt-1 text-instrument">Local space : {system?.name}</p>
        </div>
        <nav
          aria-label="Flight panels"
          className="pointer-events-auto flex w-full gap-2 tablet:w-auto"
        >
          <InstrumentButton
            variant="hud"
            aria-label="Open local system map"
            disabled={!ready || busy || dead}
            onClick={() => session.exploration.openMap('local')}
            className="min-w-0 flex-1 max-tablet:gap-1 max-tablet:px-1.5 max-tablet:text-[11px] tablet:flex-none"
          >
            <kbd className="text-instrument">L</kbd> System
          </InstrumentButton>
          <InstrumentButton
            variant="hud"
            aria-label="Open galaxy map"
            disabled={!ready || busy || dead}
            onClick={() => session.exploration.openMap('galaxy')}
            className="min-w-0 flex-1 max-tablet:gap-1 max-tablet:px-1.5 max-tablet:text-[11px] tablet:flex-none"
          >
            <kbd className="text-instrument">M</kbd> Galaxy
          </InstrumentButton>
          <InstrumentButton
            variant="hud"
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
            className="absolute top-32 left-1/2 w-52 -translate-x-1/2 text-center tablet:top-24 tablet:w-64 [@media(max-height:650px)]:hidden"
          >
            <div
              aria-hidden="true"
              className="flex justify-between px-2 text-[10px] text-phosphor-dim"
            >
              {[-60, -30, 0, 30, 60].map((offset) => (
                <span key={offset}>
                  {((heading + offset + 360) % 360).toString().padStart(3, '0')}
                </span>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="relative mt-1 flex justify-between border-b border-phosphor/25 px-3"
            >
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-x-3 border-t-4 border-x-transparent border-t-instrument" />
              {compassTicks.map((tick) => (
                <span
                  key={tick}
                  className={`w-px bg-phosphor/50 ${tick % 6 === 0 ? 'h-2' : 'h-1'}`}
                />
              ))}
            </div>
            <div className="mx-auto mt-3 flex w-fit items-center gap-3">
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
          <div className="absolute inset-x-4 bottom-16 grid grid-cols-2 items-end gap-x-6 gap-y-5 tablet:inset-x-8 tablet:grid-cols-[1fr_1.1fr_0.8fr_1.3fr] tablet:gap-x-8">
            <section aria-label="Flight telemetry" className="min-w-0">
              <div className={`${instrumentTitleClassName} short-mobile:hidden`}>
                <span>Velocity</span>
              </div>
              <div className="flex items-end gap-2 pb-3 tablet:gap-3">
                <SegmentReadout
                  label="Speed"
                  value={Math.round(telemetry.speed).toString().padStart(3, '0')}
                  className="h-12 text-instrument short-mobile:h-10 tablet:h-16"
                />
                <span className="pb-1 text-[10px] text-phosphor-dim">M/S</span>
              </div>
              <div aria-hidden="true" className="relative mb-2 h-1 max-w-56 bg-phosphor/10">
                <div
                  className="h-full origin-left bg-instrument/65 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-linear"
                  style={{
                    transform: `scaleX(${Math.min(1, telemetry.speed / speedRange)})`,
                  }}
                />
                <span
                  className="absolute -top-1 h-3 w-px bg-phosphor/65"
                  style={{
                    left: `${(FLIGHT_CONFIG.maxSpeed / speedRange) * 100}%`,
                  }}
                />
              </div>
              <div className="flex max-w-56 justify-between gap-2 text-[10px] text-phosphor-dim short-mobile:hidden">
                <span>
                  {travelMode === 'surface'
                    ? 'SURFACE COAST'
                    : travelMode === 'transit'
                      ? altitude < 60000
                        ? 'APPROACH'
                        : 'TRANSIT'
                      : `CRS ${FLIGHT_CONFIG.maxSpeed}`}
                </span>
                <span>
                  {travelMode === 'surface'
                    ? `ALT ${Math.round(descentLimit)}`
                    : travelMode === 'transit'
                      ? 'ACTIVE'
                      : `BST ${FLIGHT_CONFIG.boostMaxSpeed}`}
                </span>
              </div>
              <SpeedTrendIndicator trend={speedTrend} active={active} />
            </section>
            <section aria-label="Ship systems" className="min-w-0 tablet:max-w-72">
              <div className={instrumentTitleClassName}>
                <span>Propulsion</span>
                {telemetry.boosting && (
                  <span className="ml-auto flex items-center gap-1.5 text-instrument">
                    <span
                      aria-hidden="true"
                      className={`size-1.5 bg-current ${active ? 'hud-signal' : ''}`}
                    />
                    BST
                  </span>
                )}
              </div>
              <div className="space-y-4">
                <Meter label="THROTTLE" value={telemetry.throttle} />
                <Meter
                  label="BOOST"
                  value={telemetry.boostCharge}
                  amber={telemetry.boosting}
                  compact
                />
              </div>
            </section>
            <section aria-label="Airframe configuration" className="hidden min-w-0 tablet:block">
              <div className={instrumentTitleClassName}>
                <span>KST-01</span>
              </div>
              <div className="flex items-center gap-2">
                <ShipSchematic className="h-20 w-[45%] text-phosphor/60" />
                <dl className="space-y-3 text-[10px]">
                  <div>
                    <dt className="text-phosphor-dim">STABILIZER</dt>
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
          <NearbyPlanetMarkers />
        </>
      )}
      <footer className="absolute inset-x-4 bottom-3 flex min-h-8 items-center justify-between gap-2 text-[10px] tracking-wider tablet:inset-x-8">
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-1.5 ${busy ? 'bg-instrument' : 'bg-phosphor'} ${active ? 'hud-heartbeat' : ''}`}
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
              title="Stabilization and gravity compensation. Travel mode controls speed."
              aria-pressed={assistance}
              onClick={toggleAssistance}
              className="cursor-pointer border-l border-line px-2 py-2 hover:text-instrument focus-visible:outline-2 focus-visible:outline-focus"
            >
              <kbd className="text-instrument">F</kbd> / STAB {assistance ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </footer>
      <PlanetaryHud session={session} />
      <CombatHud session={session} />
      <HyperspaceStatus session={session} />
      <p id="scene-instructions" className="sr-only">
        Use mouse for pitch and yaw. Up arrow pitches the nose down; Down arrow pitches the nose up.
        Left and Right arrows roll left and right. Q and E yaw left and right. Hold W to gradually
        raise throttle; release to slow down. Hold S to brake, then reverse once throttle reaches
        zero. Left mouse or Space fires the selected weapon. 1 selects the gun, 2 homing missiles, 3
        the railgun, and 4 the flak scattergun. Hold Space to charge the railgun. A/D strafe, R/V
        move up/down. G selects the nearest hostile ahead, H clears it, N or Tab cycles hostiles. B
        starts a patrol encounter. Use Shift with W for boost, C for camera, F for assistance, and
        Escape to pause. M opens the galaxy map; L opens the local system map; Y opens the planetary
        map. T cycles navigation targets; X clears the target. K toggles landing gear. U takes off
        or undocks. P requests or captures docking; I cancels clearance. O toggles space transit and
        planetary approach. J assists landing at the selected zone; manual input cancels. V/R use
        planet-relative descent/lift near landable worlds; release to coast, S to brake or W for
        normal flight. F controls stabilization, independently of travel-mode speed limits. Maps
        pause offline flight. Controls are available in the flight briefing.
      </p>
      <FlightMenu session={session} />
    </div>
  );
}
