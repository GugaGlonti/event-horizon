interface IconProps {
  name: 'pause' | 'play' | 'stars' | 'reset' | 'orbit' | 'scroll';
  className?: string;
}

export function Icon({ name, className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {name === 'pause' && <path d="M8 6v12M16 6v12" />}
      {name === 'play' && <path d="m9 5 11 7-11 7V5Z" />}
      {name === 'stars' && (
        <>
          <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" />
          <path d="M20 3v4M18 5h4" />
        </>
      )}
      {name === 'reset' && (
        <>
          <path d="M4 10a8 8 0 1 1 .9 6M4 4v6h6" />
          <circle cx="12" cy="12" r="2" />
        </>
      )}
      {name === 'orbit' && (
        <>
          <circle cx="12" cy="12" r="3" />
          <ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)" />
        </>
      )}
      {name === 'scroll' && (
        <>
          <rect x="6" y="2" width="12" height="20" rx="6" />
          <path d="M12 6v4" />
        </>
      )}
    </svg>
  );
}
