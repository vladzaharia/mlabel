export function App(): React.JSX.Element {
  return (
    <div className="app-base flex h-full flex-col">
      <header className="drag glass flex h-11 items-center border-b border-border px-20">
        <span className="text-sm font-medium">MLabel</span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground text-sm">Toolchain online. Phase 0 shell.</p>
        <span className="no-drag rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          Accent
        </span>
      </main>
    </div>
  );
}
