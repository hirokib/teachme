import { Link, Outlet } from '@tanstack/react-router';
import './App.css';

export function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">TeachMe</Link>
          <div className="flex gap-5 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Learning plans</Link>
            <Link to="/chat" className="hover:text-foreground">Codex chat</Link>
          </div>
        </div>
      </nav>
      <div className="p-6 md:p-10"><Outlet /></div>
    </main>
  );
}
