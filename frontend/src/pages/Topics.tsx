import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function Topics() {
  const [newTopic, setNewTopic] = useState('');
  const queryClient = useQueryClient();

  const { data: topics, isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/topics`);
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${API_URL}/api/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      setNewTopic('');
    },
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Topics</h1>

      <div className="mb-6 p-4 bg-white rounded shadow">
        <input
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          placeholder="Add a new topic..."
          className="border px-3 py-2 rounded w-full mb-2"
        />
        <button
          onClick={() => newTopic && mutation.mutate(newTopic)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Topic
        </button>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid gap-4">
          {topics?.map((topic: any) => (
            <div key={topic.id} className="p-4 bg-white rounded shadow">
              {topic.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
