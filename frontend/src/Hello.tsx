import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function Hello() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['hello'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/hello`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json() as Promise<{ message: string }>;
    },
  });

  if (isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-destructive">{error.message}</p>;

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-bold">{data.message}</h1>
      <Button onClick={() => refetch()}>Refetch</Button>
    </div>
  );
}
