import { InstrumentButton } from '@/components/ui/InstrumentButton';
import { formatDistance } from '@/features/exploration/components/LocalSystemMap';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { usePlanetaryStore } from '@/stores/planetaryStore';
import { useRenderStatsStore } from '@/stores/renderStatsStore';
import { useStationStore } from '@/stores/stationStore';

export function PlanetaryHud({ session }: { session: FlightSession }) {
  const rtt = useMultiplayerStore((s) => s.rtt),
    tickRate = useMultiplayerStore((s) => s.tickRate),
    corrections = useMultiplayerStore((s) => s.corrections);
  const stats = useRenderStatsStore(),
    debug = useMultiplayerStore((s) => s.debug);
  const planet = usePlanetaryStore((s) => s.readout),
    station = useStationStore((s) => s.readout);
  const phase = useFlightStore((s) => s.phase),
    overlay = useExplorationStore((s) => s.overlay),
    jump = useExplorationStore((s) => s.jump.phase);
  if (phase !== 'flying' || overlay || !['IDLE', 'COOLDOWN'].includes(jump)) return null;
  const surface = planet && planet.altitude < 60000,
    nearStation = station?.stationId && (station.distance < 5000 || station.phase !== 'undocked');
  return (
    <section
      data-flight-scroll
      aria-label="Planetary and docking guidance"
      className="pointer-events-auto absolute max-h-[max(100px,calc(100svh-530px))] overflow-y-auto overscroll-contain pr-1 top-52 right-4 w-[43%] max-w-72 text-[10px] tracking-wider tablet:max-h-[calc(100svh-390px)] tablet:top-36 tablet:right-8 tablet:text-xs [@media(max-height:650px)]:top-28"
    >
      {surface && (!nearStation || station.phase === 'undocked') && (
        <>
          <p className="text-instrument">
            {planet.bodyName} / {planet.density > 0.001 ? 'ATMOSPHERE' : 'ORBIT'}
          </p>
          <InstrumentButton
            variant="hud"
            className="mt-2"
            onClick={() => session.exploration.openMap('planetary')}
          >
            Y / Planetary map
          </InstrumentButton>
          {planet.restricted && (
            <p role="alert" className="mt-2 text-instrument">
              RESTRICTED / {planet.restricted}
            </p>
          )}
          {planet.weather && (
            <p className="mt-2 text-phosphor-dim">
              {planet.weather.intensity > 0.15 ? planet.weather.kind.toUpperCase() : 'CLEAR'} / VIS{' '}
              {formatDistance(planet.weather.visibility)}
            </p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="text-phosphor-dim">SPEED MODE</dt>
            <dd>
              {planet.landingAssist
                ? 'LAND ASSIST'
                : planet.travelMode === 'surface'
                  ? 'SURFACE COAST'
                  : planet.transit
                    ? 'APPROACH'
                    : 'NORMAL'}
            </dd>
            <dt className="text-phosphor-dim">ALT / AGL</dt>
            <dd>{formatDistance(Math.max(0, planet.altitude - 5))}</dd>
            <dt className="text-phosphor-dim">VERT</dt>
            <dd>{planet.verticalSpeed.toFixed(1)} m/s</dd>
            <dt className="text-phosphor-dim">GROUND</dt>
            <dd>{planet.groundSpeed.toFixed(1)} m/s</dd>
            <dt className="text-phosphor-dim">GRAVITY</dt>
            <dd>{planet.gravity.toFixed(1)} m/s²</dd>
            <dt className="text-phosphor-dim">SURFACE HDG</dt>
            <dd>{Math.round(planet.heading) % 360}°</dd>
            {planet.descentEta !== null && planet.phase !== 'landed' && (
              <>
                <dt className="text-phosphor-dim">DESCENT ETA</dt>
                <dd>~{Math.ceil(planet.descentEta)} s</dd>
              </>
            )}
          </dl>
          {planet.travelMode === 'surface' && !planet.landingAssist && (
            <p className="mt-2 text-phosphor-dim">
              V/R set motion · release to coast · S brake · W normal flight
            </p>
          )}
          {planet.phase !== 'landed' && planet.phase !== 'taking-off' && (
            <p role={planet.brakeNow ? 'alert' : undefined} className="mt-2 text-instrument">
              {planet.brakeNow ? 'BRAKE / S — descent too fast' : planet.approachStage}
              {planet.verticalSpeed < -3 && (
                <span className="mt-1 block text-phosphor-dim">
                  STOP {formatDistance(planet.brakingDistance)} / V LIMIT{' '}
                  {Math.round(planet.descentLimit)} m/s
                </span>
              )}
            </p>
          )}
          <p className="mt-2 text-instrument">{planet.phase.toUpperCase()}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <InstrumentButton
              variant="hud"
              onClick={() => session.shipAction({ kind: 'landing-gear', enabled: !planet.gear })}
            >
              K / Gear {planet.gear ? 'down' : 'up'}
            </InstrumentButton>
            {planet.phase === 'landed' && (
              <InstrumentButton
                variant="hud"
                onClick={() => session.shipAction({ kind: 'takeoff' })}
              >
                U / Take off
              </InstrumentButton>
            )}
          </div>
          {planet.gear && (
            <p className={`mt-1 ${planet.safe ? 'text-phosphor' : 'text-instrument'}`}>
              {planet.guidance}
            </p>
          )}
          {planet.zoneId && (
            <button
              type="button"
              className="mt-2 text-left text-phosphor underline decoration-phosphor/30 underline-offset-3 focus-visible:outline-2 focus-visible:outline-focus"
              onClick={() => session.exploration.selectTarget(planet.zoneId)}
            >
              {planet.zoneName} / {formatDistance(planet.zoneDistance)}
            </button>
          )}
          {planet.phase !== 'landed' && planet.phase !== 'taking-off' && (
            <div className="mt-2">
              <InstrumentButton
                variant="hud"
                aria-pressed={Boolean(planet.landingAssist)}
                disabled={!planet.landingAssist && Boolean(planet.assistReason)}
                onClick={session.toggleLandingAssist}
              >
                J / {planet.landingAssist ? 'Cancel land assist' : 'Land assist'}
              </InstrumentButton>
              <p className="mt-1 text-phosphor-dim">
                {planet.landingAssist
                  ? 'Landing assist / manual input cancels'
                  : planet.assistReason}
              </p>
            </div>
          )}
        </>
      )}
      {nearStation && (
        <div className={surface ? 'mt-4 border-t border-line pt-3' : ''}>
          <p className="text-instrument">
            {station.stationName} / {formatDistance(station.distance)}
          </p>
          <p className="mt-1">
            {station.phase.toUpperCase()} {station.portName}
          </p>
          {station.phase === 'undocked' ? (
            <div className="mt-2 grid gap-1">
              {station.ports.map((port) => (
                <InstrumentButton
                  key={port.id}
                  variant="hud"
                  disabled={Boolean(port.occupant)}
                  onClick={() =>
                    session.shipAction({
                      kind: 'dock',
                      stationId: station.stationId ?? '',
                      portId: port.id,
                    })
                  }
                >
                  {port.name} / {port.occupant ? 'occupied' : 'request'}
                </InstrumentButton>
              ))}
            </div>
          ) : station.phase === 'docked' ? (
            <>
              <p className="mt-2 text-phosphor-dim">Berth secured / services free</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {station.services.map((service) => (
                  <InstrumentButton
                    key={service}
                    variant="hud"
                    onClick={() => session.shipAction({ kind: 'service', service })}
                  >
                    {service === 'repair'
                      ? 'Repair hull'
                      : service === 'shields'
                        ? 'Recharge shields'
                        : 'Cool weapons'}
                  </InstrumentButton>
                ))}
              </div>
              <InstrumentButton
                variant="hud"
                className="mt-2"
                onClick={() => session.shipAction({ kind: 'undock' })}
              >
                U / Undock
              </InstrumentButton>
            </>
          ) : (
            <>
              <p className="mt-2">
                Approach {formatDistance(station.approachDistance)} / Berth{' '}
                {formatDistance(station.captureDistance)}
              </p>
              <p>
                ALIGN {station.alignment.toFixed(1)}° / REL {station.speed.toFixed(1)} m/s
              </p>
              <p className="mt-1 text-phosphor-dim">Final: &lt;45 m / &lt;3 m/s / &lt;7°</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <InstrumentButton
                  variant="hud"
                  onClick={() => session.shipAction({ kind: 'capture' })}
                >
                  P / Capture
                </InstrumentButton>
                <InstrumentButton
                  variant="hud"
                  onClick={() => session.shipAction({ kind: 'cancel-docking' })}
                >
                  I / Cancel
                </InstrumentButton>
              </div>
            </>
          )}
        </div>
      )}
      {import.meta.env.DEV && debug && (
        <p className="mt-2 hidden text-[10px] text-phosphor-dim tablet:block">
          RTT {Math.round(rtt)} ms / {tickRate} Hz / corrections {corrections} /{' '}
          {stats.fps.toFixed(0)} FPS / {stats.frameMs.toFixed(1)} ms / {stats.drawCalls} calls /{' '}
          {stats.triangles} tris / {stats.geometries} geo / {stats.textures} tex / terrain{' '}
          {stats.patches} live {stats.cache} cache / build {stats.generationMs.toFixed(1)} ms
        </p>
      )}
      <InstrumentButton
        variant="hud"
        className="mt-3"
        aria-pressed={planet?.transit ?? false}
        onClick={() => session.shipAction({ kind: 'transit', enabled: !planet?.transit })}
      >
        O / {surface ? 'Approach' : 'Transit'} {planet?.transit ? 'ON' : 'OFF'}
      </InstrumentButton>
    </section>
  );
}
