import { Link, Outlet } from '@tanstack/react-router';
import './App.css';

export function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex gap-4">
          <Link to="/" className="text-lg font-bold">
            TeachMe
          </Link>
          <Link to="/topics" className="text-blue-600 hover:text-blue-800">
            Topics
          </Link>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
