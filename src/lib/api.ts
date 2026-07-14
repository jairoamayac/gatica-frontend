import type { Sesion } from './types';

// URL del backend (repo gatica-backend). En dev el backend corre en :3199.
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:3199'
    : 'https://gatica-backend.vercel.app');

const KEY = 'gatica_auth';

export function getSesion(): Sesion | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function setSesion(s: Sesion | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export class SesionExpirada extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  const s = getSesion();
  const r = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  if (r.status === 401 && path !== 'login') {
    setSesion(null);
    location.reload();
    throw new SesionExpirada('Sesión expirada');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Error ${r.status}`);
  return j as T;
}

export interface DbFilter { type: 'eq' | 'in' | 'gt'; column: string; value: unknown }
export interface DbOp {
  table: 'inventario' | 'ventas' | 'clientas' | 'fotos';
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  values?: unknown;
  select?: string;
  filters?: DbFilter[];
  order?: { column: string; ascending?: boolean };
  single?: boolean;
  returning?: boolean;
}
export interface DbResult<T> { data: T | null; error: { message: string; code?: string } | null }

export const db = <T>(op: DbOp) => post<DbResult<T>>('db', op);

export const loginReq = (usuario: string, password: string) =>
  post<Sesion>('login', { usuario, password });

export const fetchRealtimeConfig = () => post<{ sbUrl: string; sbKey: string }>('config', {});

export const esDup = (err: { message?: string; code?: string } | null) =>
  !!err && (err.code === '23505' || /duplicate/i.test(err.message || ''));
