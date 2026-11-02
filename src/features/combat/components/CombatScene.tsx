import { useFrame } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { leadTime } from '@/engine/combat/targeting';
import type { FlightSession } from '@/features/flight/FlightSession';
import { Starfighter } from '@/features/spacecraft/components/Starfighter';
import { engineEffectPower } from '@/features/spacecraft/shipEffects';
import type { SpacecraftModel, SpacecraftModels } from '@/features/spacecraft/useSpacecraftModels';
import { useCombatStore } from '@/stores/combatStore';
import { useFlightStore } from '@/stores/flightStore';
import { ENCOUNTER_CONFIG } from '../config';
import { syncEnemySlots } from '../enemySlots';
import { WeaponEffects } from './WeaponEffects';

function EnemySlot({
  session,
  slots,
  slot,
  hull,
  effectTimeRef,
  reducedMotion,
}: {
  session: FlightSession;
  slots: ReadonlyArray<string | null>;
  slot: number;
  hull: SpacecraftModel;
  effectTimeRef: RefObject<number>;
  reducedMotion: boolean;
}) {
  const model = useRef<Group>(null);
  const gear = useRef(false);
  const enginePower = useRef(0.3);
  const shield = useRef<Mesh>(null),
    material = useRef<MeshBasicMaterial>(null);
  const scratch = useMemo(() => ({ position: new Vector3(), orientation: new Quaternion() }), []);
  useFrame(() => {
    if (!model.current || !shield.current) return;
    model.current.visible = shield.current.visible = false;
    model.current.position.set(0, 0, 0);
    const id = slots[slot];
    const ship = id ? session.combat.simulation.ships.get(id) : undefined;
    if (ship && !session.exploration.jump.busy && !ship.health.destroyed) {
      session.combat.simulation.present(ship, scratch.position, scratch.orientation);
      session.origin.toRender(scratch.position, model.current.position);
      if (model.current.position.lengthSq() > 60000 ** 2) {
        model.current.position.set(0, 0, 0);
        return;
      }
      gear.current = ship.controller.landingGear;
      model.current.visible = true;
      model.current.quaternion.copy(scratch.orientation);
      shield.current.position.copy(model.current.position);
      shield.current.visible = ship.hitFlash > 0;
      if (material.current) {
        material.current.opacity = ship.hitFlash * 1.4;
        material.current.color.set(ship.shieldHit ? '#77dfff' : '#ffac55');
      }
      enginePower.current = engineEffectPower(
        ship.controller.enginePower,
        ship.controller.isBoosting,
      );
    }
  }, -0.5);
  return (
    <>
      <Starfighter
        modelRef={model}
        gearRef={gear}
        enginePowerRef={enginePower}
        effectTimeRef={effectTimeRef}
        model={hull}
        visible={false}
        reducedMotion={reducedMotion}
        effectPhase={slot * 0.37}
      />
      <mesh ref={shield} visible={false}>
        <sphereGeometry args={[6, 12, 8]} />
        <meshBasicMaterial
          ref={material}
          color="#77dfff"
          transparent
          opacity={0}
          wireframe
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

const remoteSlots = Array.from({ length: 35 }, (_, i) => i);
const slots = Array.from({ length: ENCOUNTER_CONFIG.maximumEnemies }, (_, i) => i);

/** Fixed-capacity instance buffers; transforms never pass through React or Zustand. */
export function CombatScene({
  session,
  spacecraft,
  effectTimeRef,
  reducedMotion,
}: {
  session: FlightSession;
  spacecraft: SpacecraftModels;
  effectTimeRef: RefObject<number>;
  reducedMotion: boolean;
}) {
  const enemySlots = useMemo<Array<string | null>>(
    () => Array(ENCOUNTER_CONFIG.maximumEnemies).fill(null),
    [],
  );
  const pilotSlots = useMemo<Array<string | null>>(() => Array(35).fill(null), []);
  useFrame(() => {
    const ships = session.combat.simulation.ships;
    syncEnemySlots(enemySlots, ships);
    for (let slot = 0; slot < pilotSlots.length; slot++) {
      const id = pilotSlots[slot];
      if (id && (!ships.has(id) || ships.get(id)?.team !== 'player')) pilotSlots[slot] = null;
    }
    for (const [id, ship] of ships) {
      if (
        ship === session.combat.simulation.player ||
        ship.team !== 'player' ||
        pilotSlots.includes(id)
      )
        continue;
      const index = pilotSlots.indexOf(null);
      if (index >= 0) pilotSlots[index] = id;
    }
  }, -1);
  const bolts = useRef<InstancedMesh>(null),
    rocks = useRef<InstancedMesh>(null);
  const flashes = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const particles = useRef<InstancedMesh>(null);
  const scratch = useMemo(
    () => ({
      object: new Object3D(),
      color: new Color(),
      forward: new Vector3(0, 0, 1),
      direction: new Vector3(),
    }),
    [],
  );
  useFrame(() => {
    const simulation = session.combat.simulation;
    const { object, color, forward, direction } = scratch;
    const hidden = session.exploration.jump.busy;
    if (bolts.current && halos.current) {
      let count = 0;
      if (!hidden)
        for (const shot of simulation.projectiles) {
          if (shot.kind === 'missile') continue;
          object.position
            .lerpVectors(shot.previous, shot.position, simulation.alpha)
            .sub(session.origin.position);
          if (object.position.lengthSq() > 60000 ** 2) continue;
          direction.copy(shot.velocity).normalize();
          object.quaternion.setFromUnitVectors(forward, direction);
          object.scale.set(
            shot.kind === 'flak' ? 0.4 : 0.32,
            shot.kind === 'flak' ? 0.4 : 0.32,
            shot.kind === 'flak' ? 5 : 9,
          );
          object.updateMatrix();
          bolts.current.setMatrixAt(count, object.matrix);
          object.scale.set(object.scale.x * 3, object.scale.y * 3, object.scale.z * 2.5);
          object.position.addScaledVector(direction, -6);
          object.updateMatrix();
          halos.current.setMatrixAt(count, object.matrix);
          color.set(
            shot.kind === 'flak' ? '#ffcc7c' : shot.team === 'player' ? '#8dffb4' : '#ff7854',
          );
          bolts.current.setColorAt(count, color);
          halos.current.setColorAt(count++, color);
        }
      bolts.current.count = count;
      halos.current.count = count;
      bolts.current.instanceMatrix.needsUpdate = true;
      halos.current.instanceMatrix.needsUpdate = true;
      if (bolts.current.instanceColor) bolts.current.instanceColor.needsUpdate = true;
      if (halos.current.instanceColor) halos.current.instanceColor.needsUpdate = true;
    }
    if (rocks.current) {
      let count = 0;
      if (!hidden)
        for (const rock of simulation.obstacles) {
          if (rock.kind !== 'asteroid') continue;
          object.position.copy(rock.position).sub(session.origin.position);
          if (object.position.lengthSq() > 60000 ** 2) continue;
          object.rotation.set(count * 0.37, count * 0.8, 0);
          object.scale.setScalar(rock.radius);
          object.updateMatrix();
          rocks.current.setMatrixAt(count++, object.matrix);
        }
      rocks.current.count = count;
      rocks.current.instanceMatrix.needsUpdate = true;
    }
    if (flashes.current) {
      let count = 0;
      if (!hidden)
        for (const effect of simulation.effects) {
          const progress = effect.age / effect.lifetime;
          const radius =
            effect.kind === 'explosion'
              ? 5 + progress * 28
              : effect.kind === 'detonation'
                ? 3 + progress * 16
                : effect.kind === 'shield'
                  ? 6
                  : effect.kind === 'shot' ||
                      effect.kind === 'railgun-shot' ||
                      effect.kind === 'flak-shot' ||
                      effect.kind === 'missile-launch'
                    ? (effect.kind === 'missile-launch' ? 2 : 1) * (1 - progress)
                    : 1 + progress * 4;
          object.position.copy(effect.position).sub(session.origin.position);
          if (object.position.lengthSq() > 60000 ** 2) continue;
          object.quaternion.identity();
          object.scale.setScalar(radius);
          object.updateMatrix();
          flashes.current.setMatrixAt(count, object.matrix);
          color.set(effect.kind === 'shield' ? '#75dfff' : '#ffbb65').multiplyScalar(1 - progress);
          flashes.current.setColorAt(count++, color);
        }
      flashes.current.count = count;
      flashes.current.instanceMatrix.needsUpdate = true;
      if (flashes.current.instanceColor) flashes.current.instanceColor.needsUpdate = true;
    }
    if (particles.current) {
      let count = 0;
      if (!hidden && !reducedMotion)
        for (const effect of simulation.effects) {
          if (
            effect.kind !== 'impact' &&
            effect.kind !== 'explosion' &&
            effect.kind !== 'detonation'
          )
            continue;
          const progress = effect.age / effect.lifetime;
          const explosion = effect.kind === 'explosion' || effect.kind === 'detonation';
          for (let index = 0; index < 12; index++) {
            // Seeded radial sparks/debris are analytical, bounded and frozen by simulation time.
            const angle = index * 2.399963 + effect.id;
            const y = 1 - (2 * (index + 0.5)) / 12;
            const ring = Math.sqrt(1 - y * y);
            direction.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
            object.position
              .copy(effect.position)
              .sub(session.origin.position)
              .addScaledVector(direction, (explosion ? 38 : 15) * effect.age);
            if (object.position.lengthSq() > 60000 ** 2) continue;
            object.rotation.set(angle, angle * 0.7, angle * progress);
            object.scale.setScalar((explosion ? 1.1 : 0.35) * (1 - progress));
            object.updateMatrix();
            particles.current.setMatrixAt(count, object.matrix);
            color.set(index % 3 === 0 ? '#b36d35' : '#ffd09a').multiplyScalar(1 - progress);
            particles.current.setColorAt(count++, color);
          }
        }
      particles.current.count = count;
      particles.current.instanceMatrix.needsUpdate = true;
      if (particles.current.instanceColor) particles.current.instanceColor.needsUpdate = true;
    }
  });
  return (
    <>
      {slots.map((slot) => (
        <EnemySlot
          key={slot}
          slot={slot}
          slots={enemySlots}
          session={session}
          hull={slot % 2 === 0 ? spacecraft.striker : spacecraft.insurgent}
          effectTimeRef={effectTimeRef}
          reducedMotion={reducedMotion}
        />
      ))}
      {remoteSlots.map((slot) => (
        <EnemySlot
          key={`pilot-${slot}`}
          slot={slot}
          slots={pilotSlots}
          session={session}
          hull={spacecraft.player}
          effectTimeRef={effectTimeRef}
          reducedMotion={reducedMotion}
        />
      ))}
      <instancedMesh ref={bolts} args={[undefined, undefined, 192]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, 192]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          transparent
          opacity={0.14}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={particles} args={[undefined, undefined, 1152]} frustumCulled={false}>
        <tetrahedronGeometry args={[1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={rocks}
        args={[undefined, undefined, ENCOUNTER_CONFIG.asteroids]}
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#6a6460" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={flashes} args={[undefined, undefined, 96]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          wireframe
          transparent
          opacity={0.65}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <WeaponEffects session={session} />
      <CombatProjection session={session} />
    </>
  );
}

function CombatProjection({ session }: { session: FlightSession }) {
  const last = useRef({
    readout: useCombatStore.getState().readout,
    width: 0,
    height: 0,
    mode: '',
  });
  const scratch = useMemo(
    () => ({
      point: new Vector3(),
      lead: new Vector3(),
      relative: new Vector3(),
      velocity: new Vector3(),
      cameraDirection: new Vector3(),
    }),
    [],
  );
  useFrame(({ camera, size }) => {
    const state = useCombatStore.getState();
    const flight = useFlightStore.getState();
    const simulation = session.combat.simulation;
    const target = simulation.targetId ? simulation.ships.get(simulation.targetId) : null;
    if (!target || flight.phase !== 'flying' || session.exploration.jump.busy) {
      if (state.marker) useCombatStore.setState({ marker: null });
      return;
    }
    if (
      last.current.readout === state.readout &&
      last.current.width === size.width &&
      last.current.height === size.height &&
      last.current.mode === flight.cameraMode
    )
      return;
    Object.assign(last.current, {
      readout: state.readout,
      width: size.width,
      height: size.height,
      mode: flight.cameraMode,
    });
    camera.updateMatrixWorld();
    const { point, lead, relative, velocity, cameraDirection } = scratch;
    relative.subVectors(target.position, simulation.player.position);
    const weapon = simulation.player.weapon;
    const projectile =
      weapon === 4 ? simulation.player.config.flak : simulation.player.config.laser;
    velocity
      .copy(target.velocity)
      .addScaledVector(
        scratch.velocity.set(
          simulation.player.velocity.x,
          simulation.player.velocity.y,
          simulation.player.velocity.z,
        ),
        -projectile.velocityInheritance,
      );
    const time =
      weapon === 1 || weapon === 4
        ? leadTime(
            relative,
            velocity,
            projectile.speed,
            Math.min(projectile.lifetime, projectile.range / projectile.speed),
          )
        : 0;
    lead.copy(target.position).addScaledVector(velocity, time).sub(session.origin.position);
    lead.project(camera);
    point.copy(target.position).sub(session.origin.position);
    cameraDirection.copy(point).applyMatrix4(camera.matrixWorldInverse);
    const aft = cameraDirection.z > 0;
    point.project(camera);
    if (aft) {
      point.x *= -1;
      point.y *= -1;
    }
    const edge = aft || Math.abs(point.x) > 0.85 || Math.abs(point.y) > 0.65;
    let x = point.x,
      y = point.y;
    if (edge) {
      const scale = Math.max(Math.abs(x) / 0.85, Math.abs(y) / 0.6, 1);
      x /= scale;
      y /= scale;
    }
    useCombatStore.setState({
      marker: {
        x: (x * 0.5 + 0.5) * size.width,
        y: (-y * 0.5 + 0.5) * size.height,
        aft,
        edge,
        leadX:
          (weapon === 3 || time > 0) && !aft && Math.abs(lead.x) < 0.9 && Math.abs(lead.y) < 0.7
            ? (lead.x * 0.5 + 0.5) * size.width
            : null,
        leadY:
          (weapon === 3 || time > 0) && !aft && Math.abs(lead.x) < 0.9 && Math.abs(lead.y) < 0.7
            ? (-lead.y * 0.5 + 0.5) * size.height
            : null,
      },
    });
  }, -1);
  return null;
}
