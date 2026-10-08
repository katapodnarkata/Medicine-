import Constants from 'expo-constants';
import type { Call, Role, Team, User } from './types';

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:3000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');
  }
  if (res.status === 401 && authToken) onUnauthorized?.();
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `Ошибка сервера (${res.status})`);
  return json as T;
}

export const api = {
  register: (data: { name: string; phone: string; role: Role }) =>
    request<{ token: string; user: User }>('POST', '/api/register', data),
  me: () => request<User>('GET', '/api/me'),
  updateMe: (data: Partial<{ name: string; phone: string; role: Role; teamId: number | null }>) =>
    request<User>('PATCH', '/api/me', data),
  setPushToken: (token: string | null) => request<void>('PUT', '/api/me/push-token', { token }),
  logout: () => request<void>('POST', '/api/logout'),

  teams: () => request<Team[]>('GET', '/api/teams'),
  createTeam: (name: string) => request<Team>('POST', '/api/teams', { name }),
  teamMembers: (teamId: number) => request<User[]>('GET', `/api/teams/${teamId}/members`),
  participants: () => request<User[]>('GET', '/api/participants'),
  setUserTeam: (userId: number, teamId: number | null) =>
    request<User>('PUT', `/api/users/${userId}/team`, { teamId }),
  deleteUser: (userId: number) => request<void>('DELETE', `/api/users/${userId}`),

  sendCall: (data: { kind: 'car' } | { kind: 'place'; place: string }) => request<Call>('POST', '/api/calls', data),
  activeCalls: () => request<Call[]>('GET', '/api/calls/active'),
  history: () => request<Call[]>('GET', '/api/calls/history'),
  call: (id: number) => request<Call>('GET', `/api/calls/${id}`),
  ack: (id: number) => request<Call>('POST', `/api/calls/${id}/ack`),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
