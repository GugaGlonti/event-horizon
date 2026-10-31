interface SceneMessageProps {
  title: string;
  children: React.ReactNode;
}

export function SceneMessage({ title, children }: SceneMessageProps) {
  return (
    <div className="scene-message" role="status">
      <span className="eyebrow">EVENT HORIZON</span>
      <p className="mt-3 text-xl text-stone-100">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}
