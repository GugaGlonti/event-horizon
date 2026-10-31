import type { ButtonHTMLAttributes } from 'react';

const buttonClassName =
  'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-phosphor transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-phosphor-dim/50 motion-reduce:transition-none';

export const instrumentButtonClassName = `${buttonClassName} border border-line bg-console hover:border-phosphor hover:bg-phosphor/10 disabled:border-line/50 aria-pressed:border-phosphor aria-pressed:bg-phosphor aria-pressed:text-console`;

const hudButtonClassName = `${buttonClassName} border-b border-transparent bg-transparent hover:border-phosphor/60 hover:text-instrument aria-pressed:border-phosphor aria-pressed:text-instrument`;

export function InstrumentButton({
  primary = false,
  variant = 'panel',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; variant?: 'panel' | 'hud' }) {
  return (
    <button
      type="button"
      {...props}
      data-primary={primary}
      className={`${variant === 'hud' ? hudButtonClassName : instrumentButtonClassName} data-[primary=true]:border-phosphor data-[primary=true]:bg-phosphor data-[primary=true]:text-console data-[primary=true]:hover:bg-[#b9ffcc] data-[primary=true]:disabled:bg-line/30 ${className}`}
    />
  );
}
