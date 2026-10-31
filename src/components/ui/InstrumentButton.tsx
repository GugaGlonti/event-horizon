import type { ButtonHTMLAttributes } from 'react';

export const instrumentButtonClassName =
  'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 border border-line bg-console px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-phosphor transition-colors hover:border-phosphor hover:bg-phosphor/10 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:border-line/50 disabled:text-phosphor-dim/50 motion-reduce:transition-none aria-pressed:border-phosphor aria-pressed:bg-phosphor aria-pressed:text-console';

export function InstrumentButton({
  primary = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      data-primary={primary}
      className={`${instrumentButtonClassName} data-[primary=true]:border-phosphor data-[primary=true]:bg-phosphor data-[primary=true]:text-console data-[primary=true]:hover:bg-[#b9ffcc] data-[primary=true]:disabled:bg-line/30 ${className}`}
    />
  );
}
