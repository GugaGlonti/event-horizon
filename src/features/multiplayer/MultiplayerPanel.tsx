import { useState } from 'react';
import { InstrumentButton } from '@/components/ui/InstrumentButton';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

export function MultiplayerPanel({ session }: { session: FlightSession }) {
  const status = useMultiplayerStore((s) => s.status);
  const error = useMultiplayerStore((s) => s.error);
  const debug = useMultiplayerStore((s) => s.debug);
  const [name, setName] = useState(useMultiplayerStore.getState().name);
  return (
    <section
      aria-label="Multiplayer connection"
      className="mt-4 border-y border-line py-3 text-[11px]"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-phosphor-dim">
          Guest callsign
          <input
            aria-label="Guest callsign"
            maxLength={24}
            value={name}
            disabled={session.multiplayer.enabled}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full border border-line bg-space px-2 py-2 text-phosphor outline-focus"
          />
        </label>
        <InstrumentButton
          disabled={status === 'connecting' || !name.trim()}
          onClick={() =>
            session.multiplayer.enabled && status !== 'error'
              ? session.disconnectMultiplayer()
              : session.connectMultiplayer(name.trim())
          }
        >
          {status === 'error'
            ? 'Reconnect'
            : session.multiplayer.enabled
              ? 'Disconnect'
              : 'Connect multiplayer'}
        </InstrumentButton>
      </div>
      <p role="status" className="mt-2 text-instrument">
        Network: {status}
      </p>
      <p className="mt-1 normal-case text-phosphor-dim">
        Shared systems · PvP enabled · Menus release controls; the server keeps flying.
      </p>
      {error && (
        <p role="alert" className="mt-2 normal-case text-instrument">
          {error}
        </p>
      )}
      {import.meta.env.DEV && (
        <>
          <InstrumentButton
            variant="hud"
            aria-pressed={debug}
            onClick={() => useMultiplayerStore.setState({ debug: !debug })}
          >
            Network diagnostics
          </InstrumentButton>
          {debug && session.multiplayer.network.connected && (
            <InstrumentButton
              variant="hud"
              onClick={() => session.multiplayer.network.room?.connection.close()}
            >
              Simulate connection drop
            </InstrumentButton>
          )}
          {debug && (
            <div className="mt-2 flex flex-wrap gap-3">
              {(['latency', 'jitter', 'loss'] as const).map((field) => (
                <label key={field}>
                  {field} {field === 'loss' ? '%' : 'ms'}
                  <input
                    aria-label={`Simulated ${field}`}
                    type="number"
                    min={0}
                    max={field === 'loss' ? 50 : 1000}
                    defaultValue={0}
                    onChange={(event) =>
                      useMultiplayerStore.setState({
                        [field]: Math.max(
                          0,
                          Math.min(field === 'loss' ? 50 : 1000, Number(event.target.value) || 0),
                        ),
                      })
                    }
                    className="ml-1 w-16 border border-line bg-space p-1 text-phosphor"
                  />
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function MultiplayerHud({ session }: { session: FlightSession }) {
  const phase = useFlightStore((s) => s.phase);
  const dead = useCombatStore((s) => s.readout.dead);
  const jump = useExplorationStore((s) => s.jump.phase);
  const status = useMultiplayerStore((s) => s.status),
    players = useMultiplayerStore((s) => s.players);
  const kills = useMultiplayerStore((s) => s.kills),
    deaths = useMultiplayerStore((s) => s.deaths);
  const error = useMultiplayerStore((s) => s.error),
    name = useMultiplayerStore((s) => s.name);
  const markers = useMultiplayerStore((s) => s.markers);
  if (
    status === 'offline' ||
    (phase !== 'flying' && !dead && (jump === 'IDLE' || jump === 'COOLDOWN'))
  )
    return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 font-mono text-[10px] uppercase text-phosphor">
      <div className="absolute top-32 left-4 max-w-[calc(100%-2rem)] tablet:top-22 tablet:left-8">
        <p role="status">
          {name} / {status} / {players} pilots / K {kills} D {deaths}
        </p>
        <InstrumentButton
          variant="hud"
          className="pointer-events-auto min-h-6 px-0 py-1 text-[10px]"
          onClick={session.disconnectMultiplayer}
          aria-label="Disconnect multiplayer"
        >
          Disconnect
        </InstrumentButton>
        {error && (
          <p role="alert" className="mt-1 max-w-sm text-instrument normal-case">
            {error}
          </p>
        )}
      </div>
      {markers.map((marker) => (
        <div
          key={marker.id}
          className="absolute max-w-36 -translate-x-1/2 -translate-y-1/2 text-center text-instrument"
          style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
        >
          <span aria-hidden="true">{marker.edge ? '◇' : '⌖'}</span> {marker.name}
          <br />
          <span className="text-phosphor-dim">{Math.round(marker.distance)} m</span>
        </div>
      ))}
    </div>
  );
}
