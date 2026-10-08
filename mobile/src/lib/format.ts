const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export const ROLE_LABEL = { dispatcher: 'Диспетчер', participant: 'Участник' } as const;
