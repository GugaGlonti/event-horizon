import type { ReactNode } from 'react';

interface SceneMessageProps {
  title: string;
  children: ReactNode;
}

export function SceneMessage({ title, children }: SceneMessageProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-scene-message p-8 text-center"
      role="status"
    >
      <span className="font-mono text-[9px] leading-[1.6] tracking-[0.14em] text-subtle">
        EVENT HORIZON
      </span>
      <p className="mt-3 text-xl text-stone-100">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}
