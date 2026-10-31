const segments = [
  '3,1 17,1 19,3 17,5 3,5 1,3',
  '18,6 20,4 22,6 22,18 20,20 18,18',
  '18,24 20,22 22,24 22,36 20,38 18,36',
  '3,37 17,37 19,39 17,41 3,41 1,39',
  '0,24 2,22 4,24 4,36 2,38 0,36',
  '0,6 2,4 4,6 4,18 2,20 0,18',
  '4,19 17,19 19,21 17,23 4,23 2,21',
];
const digits = [
  'abcdef',
  'bc',
  'abdeg',
  'abcdg',
  'bcfg',
  'acdfg',
  'acdefg',
  'abc',
  'abcdefg',
  'abcdfg',
];

/** The text alternative remains readable when SVG or its phosphor treatment is unavailable. */
export function SegmentReadout({
  value,
  label,
  className = '',
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const places = Array.from(value, (digit, position) => ({
    digit,
    place: 10 ** (value.length - position - 1),
    x: position * 29,
  }));
  return (
    <output aria-label={label} aria-live="off" className={`block ${className}`}>
      <span className="sr-only">{value}</span>
      <svg
        viewBox={`0 0 ${value.length * 29 - 7} 42`}
        className="instrument-glow h-full max-w-full"
        aria-hidden="true"
        fill="currentColor"
      >
        {places.map(({ digit, place, x }) => (
          <g key={place} transform={`translate(${x} 0)`}>
            {segments.map((points, segment) => (
              <polygon
                key={points}
                points={points}
                opacity={digits[Number(digit)]?.includes('abcdefg'[segment] ?? '') ? 1 : 0.07}
              />
            ))}
          </g>
        ))}
      </svg>
    </output>
  );
}
