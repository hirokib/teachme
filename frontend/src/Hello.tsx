import { useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function Hello() {
  const { data, isPending, error } = useQuery({
    queryKey: ['hello'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/hello`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json() as Promise<{ message: string }>;
    },
  });

  if (isPending) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return <h1>{data.message}</h1>;
}
