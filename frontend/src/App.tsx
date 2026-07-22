import { Link, Outlet } from '@tanstack/react-router';
import './App.css';

export function App() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-accent/40 to-background text-foreground">
      <nav className="border-b bg-card/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">T</span>
            TeachMe
          </Link>
          <div className="flex gap-5 text-sm text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-primary [&.active]:text-primary">Learning plans</Link>
            <Link to="/chat" className="transition-colors hover:text-primary [&.active]:text-primary">Codex chat</Link>
          </div>
        </div>
      </nav>
      <div className="p-6 md:p-10"><Outlet /></div>
    </main>
  );
}
