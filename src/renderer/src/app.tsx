export function App(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-11 items-center border-b border-border bg-chrome px-20">
        <span className="text-sm font-medium">MLabel</span>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Toolchain online. Phase 0 shell.</p>
      </main>
    </div>
  );
}
