import { Link, Outlet } from '@tanstack/react-router';
import './App.css';

export function App() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <nav className="mb-6 flex gap-4 text-sm">
        <Link to="/" className="hover:underline">
          Home
        </Link>
        <Link to="/chat" className="hover:underline">
          Chat
        </Link>
      </nav>
      <Outlet />
    </main>
  );
}
