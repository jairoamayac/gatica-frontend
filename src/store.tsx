import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, fetchRealtimeConfig, getSesion, setSesion, loginReq } from '@/lib/api';
import { mapInv } from '@/lib/utils';
import type { InvItem, InvRow, Venta, Clienta, Sesion } from '@/lib/types';

interface Store {
  sesion: Sesion | null;
  esCeo: boolean;
  online: boolean;
  cargando: boolean;
  inventario: InvItem[];
  ventas: Venta[];
  clientas: Clienta[];
  fotosMap: Record<string, string>;
  login: (usuario: string, password: string) => Promise<void>;
  logout: () => void;
  recargarInv: () => Promise<void>;
  recargarVen: () => Promise<void>;
  recargarCli: () => Promise<void>;
  recargarFotos: () => Promise<void>;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

const INV_COLS = 'id,sku,marca,marca_cod,modelo,modelo_cod,color,color_cod,talla,nombre,costo,precio,stock,stock_min';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSes] = useState<Sesion | null>(getSesion());
  const [online, setOnline] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [inventario, setInventario] = useState<InvItem[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientas, setClientas] = useState<Clienta[]>([]);
  const [fotosMap, setFotosMap] = useState<Record<string, string>>({});
  const rtRef = useRef<SupabaseClient | null>(null);

  const recargarInv = useCallback(async () => {
    const { data, error } = await db<InvRow[]>({ table: 'inventario', action: 'select', select: INV_COLS, order: { column: 'marca' } });
    if (!error && data) setInventario(data.map(mapInv));
  }, []);
  const recargarVen = useCallback(async () => {
    const { data, error } = await db<Venta[]>({ table: 'ventas', action: 'select', select: '*', order: { column: 'id', ascending: false } });
    if (!error && data) setVentas(data);
  }, []);
  const recargarCli = useCallback(async () => {
    const { data, error } = await db<Clienta[]>({ table: 'clientas', action: 'select', select: '*', order: { column: 'nombre' } });
    if (!error && data) setClientas(data);
  }, []);
  const recargarFotos = useCallback(async () => {
    const { data, error } = await db<{ modelo_key: string; foto: string }[]>({ table: 'fotos', action: 'select', select: '*' });
    if (!error && data) {
      const m: Record<string, string> = {};
      data.forEach((r) => { if (r.foto) m[r.modelo_key] = r.foto; });
      setFotosMap(m);
    }
  }, []);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      await Promise.all([recargarInv(), recargarVen(), recargarCli(), recargarFotos()]);
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setCargando(false);
    }
  }, [recargarInv, recargarVen, recargarCli, recargarFotos]);

  const suscribirRealtime = useCallback(async () => {
    try {
      const cfg = await fetchRealtimeConfig();
      if (!cfg.sbUrl || rtRef.current) return;
      const rt = createClient(cfg.sbUrl, cfg.sbKey);
      rtRef.current = rt;
      rt.channel('gatica')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, () => void recargarInv())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => void recargarVen())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientas' }, () => void recargarCli())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fotos' }, () => void recargarFotos())
        .subscribe();
    } catch { /* realtime es opcional */ }
  }, [recargarInv, recargarVen, recargarCli, recargarFotos]);

  useEffect(() => {
    if (sesion) {
      void cargarTodo().then(suscribirRealtime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.token]);

  const login = useCallback(async (usuario: string, password: string) => {
    const s = await loginReq(usuario, password);
    setSesion(s);
    setSes(s);
  }, []);

  const logout = useCallback(() => {
    setSesion(null);
    rtRef.current?.removeAllChannels();
    location.reload();
  }, []);

  return (
    <Ctx.Provider value={{ sesion, esCeo: sesion?.rol === 'ceo', online, cargando, inventario, ventas, clientas, fotosMap, login, logout, recargarInv, recargarVen, recargarCli, recargarFotos }}>
      {children}
    </Ctx.Provider>
  );
}
