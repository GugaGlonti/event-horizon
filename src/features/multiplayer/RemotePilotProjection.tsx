import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

export function RemotePilotProjection({ session }: { session: FlightSession }) {
  const elapsed = useRef(0),
    point = useRef(new Vector3());
  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.1) return;
    elapsed.current %= 0.1;
    if (!session.multiplayer.enabled || session.exploration.jump.busy) {
      if (useMultiplayerStore.getState().markers.length)
        useMultiplayerStore.setState({ markers: [] });
      return;
    }
    const markers = [];
    for (const ship of session.combat.simulation.ships.values()) {
      if (
        ship === session.combat.simulation.player ||
        ship.team !== 'player' ||
        ship.health.destroyed ||
        ship.transferring
      )
        continue;
      const distance = ship.position.distanceTo(session.position);
      if (distance > 6000) continue;
      const p = point.current
        .set(ship.position.x, ship.position.y, ship.position.z)
        .sub(session.origin.position)
        .project(camera);
      const behind = p.z > 1;
      const x = behind ? -p.x : p.x,
        y = behind ? -p.y : p.y;
      const edge = behind || Math.abs(x) > 0.85 || Math.abs(y) > 0.65;
      const scale = Math.max(1, Math.abs(x) / 0.85, Math.abs(y) / 0.65);
      markers.push({
        id: ship.id,
        name: session.multiplayer.names.get(ship.id) ?? 'Pilot',
        x: 50 + (x / scale) * 50,
        y: 50 - (y / scale) * 50,
        distance,
        edge,
      });
    }
    useMultiplayerStore.setState({
      markers: markers.sort((a, b) => a.distance - b.distance).slice(0, 10),
    });
  }, 0);
  return null;
}
