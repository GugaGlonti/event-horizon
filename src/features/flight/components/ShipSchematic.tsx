export function ShipSchematic({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 180"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
      aria-hidden="true"
    >
      <g opacity="0.2" strokeWidth="0.6">
        <path d="M10 45h200M10 90h200M10 135h200M55 10v160M110 10v160M165 10v160" />
        <circle cx="110" cy="90" r="67" strokeDasharray="3 5" />
      </g>
      <path d="m110 13 17 66 62 46v25l-64-22-15 30-15-30-64 22v-25l62-46Z" />
      <path d="m110 13-7 73 7 72 7-72ZM93 79l10 7-8 42m32-49-10 7 8 42M31 125l64-15m94 15-64-15M43 129v15m134-15v15" />
      <path d="m105 59 5-13 5 13 3 27-8 9-8-9ZM66 115v28h14v-34m60 0v34h14v-28" />
      <path d="M69 148v10m8-10v10m66-10v10m8-10v10" strokeWidth="2" />
      <g opacity="0.6" strokeWidth="0.7">
        <path d="M14 13h30m-30 0v25m192-25h-30m30 0v25M14 167h30m-30 0v-25m192 25h-30m30 0v-25" />
        <path d="M110 3v5m0 160v8M2 90h12m192 0h12" />
      </g>
    </svg>
  );
}
