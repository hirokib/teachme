import { Outlet } from '@tanstack/react-router';
import './App.css';

export function App() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <Outlet />
    </main>
  );
}
