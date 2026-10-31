import type { ReactNode } from 'react';

interface SceneMessageProps {
  title: string;
  children: ReactNode;
}

export function SceneMessage({ title, children }: SceneMessageProps) {
  return (
    <div
      className="crt-grid absolute inset-0 flex flex-col items-center justify-center bg-console p-8 text-center font-mono text-phosphor"
      role="status"
    >
      <span className="border border-line px-4 py-2 text-[10px] leading-[1.6] tracking-[0.14em] text-phosphor-dim">
        EVENT HORIZON / FLIGHT TERMINAL
      </span>
      <p className="mt-5 text-xl font-bold uppercase text-instrument">{title}</p>
      <p className="mt-3 max-w-sm text-xs leading-6 text-phosphor-dim">{children}</p>
    </div>
  );
}
