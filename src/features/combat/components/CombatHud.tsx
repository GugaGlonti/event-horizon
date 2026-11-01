import { InstrumentButton } from '@/components/ui/InstrumentButton';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';
import { WEAPON_CHOICES } from '../config';

export function CombatHud({ session }: { session: FlightSession }) {
  const readout = useCombatStore((state) => state.readout);
  const marker = useCombatStore((state) => state.marker);
  const phase = useFlightStore((state) => state.phase);
  const overlay = useExplorationStore((state) => state.overlay);
  const jump = useExplorationStore((state) => state.jump.phase);
  const busy = jump !== 'IDLE' && jump !== 'COOLDOWN';
  if (overlay || busy) return null;
  if (readout.dead)
    return (
      <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-space/80 p-6">
        <section
          aria-labelledby="destruction-title"
          className="w-full max-w-md border border-instrument bg-console p-6"
        >
          <p className="text-xs tracking-widest text-instrument">Flight recorder / Signal lost</p>
          <h2 id="destruction-title" className="mt-4 text-2xl">
            Kestrel destroyed.
          </h2>
          <p className="mt-4 text-sm leading-6 normal-case text-phosphor-dim">
            {readout.kills} contacts destroyed. Respawn at a safe arrival in this system with full
            shields, hull and three seconds of protection. Flight resumes in this system.
          </p>
          <InstrumentButton primary onClick={session.respawn} className="mt-6 w-full" autoFocus>
            Respawn / keyboard flight
          </InstrumentButton>
        </section>
      </div>
    );
  if (phase !== 'flying') return null;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 border-4 border-instrument"
        style={{ opacity: readout.damage * 0.6 }}
      />
      <section
        aria-label="Combat systems"
        className="absolute top-52 left-4 max-w-[47%] text-[10px] tracking-wider tablet:top-36 tablet:left-8 tablet:w-56 tablet:max-w-none tablet:text-xs [@media(max-height:650px)]:top-28"
      >
        <p className="mb-2 text-phosphor-dim [@media(max-height:650px)]:mb-1">
          DEFENSE {readout.invulnerable ? '/ PROTECTED' : '/ LIVE'}
        </p>
        <DefenseGauge label="Shield" value={readout.shields} />
        <DefenseGauge label="Hull" value={readout.hull} />
        <DefenseGauge label="Laser heat" value={readout.heat} warning />
        <p className="mt-1 text-[10px] text-instrument">
          {readout.overheated
            ? 'OVERHEATED / COOLING'
            : readout.damage > 0
              ? 'INCOMING DAMAGE'
              : 'CANNONS READY'}
        </p>
        <p className="mt-3 text-instrument [@media(max-height:650px)]:mt-1">
          {readout.hostiles} CONTACTS / {readout.kills} KILLS
        </p>
        <p className="mt-3 text-[10px] text-phosphor-dim [@media(max-height:650px)]:mt-1">
          WEAPON / {WEAPON_CHOICES.find((choice) => choice.slot === readout.weapon)?.label}
        </p>
        <fieldset
          aria-label="Weapon selection"
          className="pointer-events-auto mt-1 flex items-center gap-1"
        >
          {WEAPON_CHOICES.map(({ slot, label }) => (
            <InstrumentButton
              key={slot}
              variant="hud"
              aria-label={`Select ${label} (${slot})`}
              aria-pressed={readout.weapon === slot}
              onClick={() => session.combat.selectWeapon(slot)}
              className="min-h-7 px-1.5 py-1 text-[11px]"
            >
              {slot}
            </InstrumentButton>
          ))}
          <span className="ml-1 text-[10px] text-instrument">
            {readout.weaponCooldown > 0
              ? `${(Math.ceil(readout.weaponCooldown * 10) / 10).toFixed(1)}S`
              : 'READY'}
          </span>
        </fieldset>
        {readout.weapon === 3 && (
          <div className="mt-1 text-[10px] text-instrument">
            <p>
              {readout.weaponCharge > 0
                ? `CHARGING ${Math.round(readout.weaponCharge * 100)}%`
                : readout.weaponCooldown > 0
                  ? 'RELOADING'
                  : 'HOLD SPACE / CHARGE'}
            </p>
            <meter
              className="sr-only"
              aria-label="Railgun charge"
              value={readout.weaponCharge}
              min={0}
              max={1}
            />
            <div aria-hidden="true" className="mt-1 h-1 bg-instrument/15">
              <div
                className="h-full bg-instrument"
                style={{ width: `${readout.weaponCharge * 100}%` }}
              />
            </div>
          </div>
        )}
        {readout.weapon === 4 && (
          <p className="mt-1 text-[10px] text-instrument">CLOSE RANGE / 325 M</p>
        )}
        {readout.weapon === 2 && (
          <p className="mt-1 text-[10px] text-instrument">
            {readout.missileLocked ? 'TARGET LOCKED' : 'NO LOCK / UNGUIDED'}
          </p>
        )}
        <p className="mt-2 max-w-56 text-[10px] leading-4 text-phosphor-dim [@media(max-height:650px)]:hidden">
          {readout.status}
        </p>
        <p className="mt-2 hidden text-[10px] text-phosphor-dim tablet:block">
          MOUSE / SPACE: FIRE · G: ACQUIRE · N: NEXT · H: CLEAR
        </p>
        {readout.target && (
          <section
            aria-label="Combat target"
            className="mt-3 border-t border-line pt-2 text-[10px] tracking-wider"
          >
            <p className="text-instrument">
              {readout.target.name} / {Math.round(readout.target.distance)} M
            </p>
            <p className="mt-2 text-phosphor-dim">{readout.target.state} / N: NEXT</p>
            <div className="mt-2">
              <DefenseGauge label="TGT Shield" value={readout.target.shields} />
              <DefenseGauge label="TGT Hull" value={readout.target.hull} />
            </div>
          </section>
        )}
      </section>
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-phosphor/80"
      >
        <span className="absolute top-1/2 -left-2 h-px w-3 bg-current" />
        <span className="absolute top-1/2 -right-2 h-px w-3 bg-current" />
        <span className="absolute -top-2 left-1/2 h-3 w-px bg-current" />
        <span className="absolute top-1/2 left-1/2 size-0.5 bg-current" />
      </div>
      {marker && (
        <>
          <div
            aria-hidden="true"
            className="absolute size-10 -translate-1/2 border border-instrument/90 text-instrument"
            style={{ left: marker.x, top: marker.y }}
          >
            <span className="absolute top-11 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]">
              {marker.aft ? 'AFT / TURN' : marker.edge ? 'CONTACT' : 'HOSTILE'}
            </span>
          </div>
          {marker.leadX !== null && marker.leadY !== null && (
            <div
              role="img"
              aria-label={readout.weapon === 3 ? 'Railgun aim point' : 'Aim lead indicator'}
              className="absolute size-3 -translate-1/2 rotate-45 border border-instrument"
              style={{ left: marker.leadX, top: marker.leadY }}
            />
          )}
        </>
      )}
    </>
  );
}

function DefenseGauge({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="mt-1.5 [@media(max-height:650px)]:mt-1">
      <div className="flex justify-between gap-2">
        <span>{label}</span>
        <span>{Math.ceil(value * 100)}%</span>
      </div>
      <meter className="sr-only" aria-label={label} min={0} max={1} value={value} />
      <div aria-hidden="true" className="mt-1 h-1 bg-phosphor/15 [@media(max-height:650px)]:mt-0.5">
        <div
          className={
            (warning ? value > 0.75 : value < 0.25)
              ? 'h-full bg-instrument'
              : 'h-full bg-phosphor/80'
          }
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
