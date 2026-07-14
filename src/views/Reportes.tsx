import { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useStore } from '@/store';
import { db } from '@/lib/api';
import { fmtFecha, fmtHora, getAbonos, hoyVz, mesVz, modeloKey, money, norm } from '@/lib/utils';
import { exportarVentas } from '@/lib/excel';
import type { Venta } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Thumb } from '@/components/Thumb';

export function Reportes() {
  const { ventas, inventario, fotosMap, esCeo, recargarInv, recargarVen } = useStore();
  const [dia, setDia] = useState(hoyVz());
  const [modeloRep, setModeloRep] = useState('');

  const vald = useMemo(() => ventas.filter((v) => v.estado !== 'cancelado'), [ventas]);

  const stats = useMemo(() => {
    const hoy = hoyVz(), mes = mesVz();
    let iHoy = 0, iMes = 0, iAll = 0, gMes = 0;
    let nHoy = 0, nMes = 0;
    const mModelo: Record<string, number> = {}, mColor: Record<string, number> = {};
    vald.forEach((v) => {
      const fv = (v.fecha || '').slice(0, 10), mv = (v.fecha || '').slice(0, 7);
      if (fv === hoy) nHoy++;
      if (mv === mes) nMes++;
      getAbonos(v).forEach((ab) => {
        const f = (ab.fecha || '').slice(0, 10), m = (ab.fecha || '').slice(0, 7), mo = +ab.monto || 0;
        iAll += mo; if (m === mes) iMes += mo; if (f === hoy) iHoy += mo;
      });
      (v.items || []).forEach((it) => {
        const inv = inventario.find((x) => x.sku === it.sku);
        const modelo = inv ? inv.modelo : it.nombre || '?';
        const color = inv ? inv.color : '?';
        mModelo[modelo] = (mModelo[modelo] || 0) + it.cantidad;
        mColor[color] = (mColor[color] || 0) + it.cantidad;
        if (v.estado === 'pagado') {
          const g = (it.precio - (inv?.costo || 0)) * it.cantidad;
          if (mv === mes) gMes += g;
        }
      });
    });
    return { iHoy, iMes, iAll, gMes, nHoy, nMes, mModelo, mColor };
  }, [vald, inventario]);

  const transDia = useMemo(() => vald.filter((v) => (v.fecha || '').slice(0, 10) === dia), [vald, dia]);
  const recibidoDia = useMemo(() => {
    let r = 0;
    vald.forEach((v) => getAbonos(v).forEach((ab) => { if ((ab.fecha || '').slice(0, 10) === dia) r += +ab.monto || 0; }));
    return r;
  }, [vald, dia]);

  const modelosOpc = useMemo(() => {
    const m = new Map<string, string>();
    inventario.forEach((i) => { const k = modeloKey(i); if (!m.has(k)) m.set(k, `${i.marca} ${i.modelo}${i.color ? ' · ' + i.color : ''}`); });
    return [...m.entries()];
  }, [inventario]);

  const ventasModelo = useMemo(() => {
    if (!modeloRep) return null;
    const skus = new Set(inventario.filter((i) => modeloKey(i) === modeloRep).map((i) => i.sku));
    const res = vald.filter((v) => (v.items || []).some((it) => skus.has(it.sku)))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const pares = res.reduce((a, v) => a + (v.items || []).filter((it) => skus.has(it.sku)).reduce((x, it) => x + it.cantidad, 0), 0);
    return { res, pares, skus };
  }, [modeloRep, vald, inventario]);

  const fotoDeSku = (sku?: string) => {
    if (!sku) return undefined;
    const it = inventario.find((x) => x.sku === sku);
    return it ? fotosMap[modeloKey(it)] : undefined;
  };

  async function eliminarVenta(v: Venta) {
    if (!confirm(`¿Eliminar esta ${v.tipo === 'apartado' ? 'apartado' : 'venta'}?\nEl stock de los zapatos volverá al inventario.`)) return;
    if (v.estado !== 'cancelado') {
      for (const c of v.items || []) {
        const it = inventario.find((x) => x.sku === c.sku);
        if (it) await db({ table: 'inventario', action: 'update', values: { stock: it.stock + c.cantidad }, filters: [{ type: 'eq', column: 'sku', value: c.sku }] });
      }
    }
    const { error } = await db({ table: 'ventas', action: 'delete', filters: [{ type: 'eq', column: 'id', value: v.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await Promise.all([recargarInv(), recargarVen()]);
  }

  const Metric = ({ big, small }: { big: string; small: string }) => (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-[12px] font-medium text-muted-foreground">{small}</div>
      <div className="mt-1 text-2xl font-bold tabular text-navy">{big}</div>
    </div>
  );

  const Barras = ({ obj }: { obj: Record<string, number> }) => {
    const arr = Object.entries(obj).filter(([k]) => k && k !== '?').sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!arr.length) return <p className="py-4 text-center text-[13px] text-muted-foreground">Sin datos todavía</p>;
    const max = arr[0][1];
    return (
      <div className="space-y-2">
        {arr.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-[13px]">
            <span className="w-24 truncate">{k}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-secondary">
              <div className="h-full rounded bg-primary" style={{ width: Math.round((v / max) * 100) + '%' }} />
            </div>
            <b className="tabular">{v}</b>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${esCeo ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
        <Metric big={money(stats.iHoy)} small={`Hoy · ${stats.nHoy} ventas`} />
        <Metric big={money(stats.iMes)} small={`Este mes · ${stats.nMes} ventas`} />
        <Metric big={money(stats.iAll)} small="Recibido total" />
        {esCeo && <Metric big={money(Math.round(stats.gMes))} small="Ganancia del mes" />}
      </div>

      <Button variant="secondary" onClick={() => exportarVentas(ventas)}><Download className="h-4 w-4" /> Exportar ventas a Excel</Button>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ventas por día</CardTitle></CardHeader>
          <CardContent>
            <Label>Elige un día</Label>
            <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            <div className="mt-3 rounded-lg border bg-secondary/50 p-3 text-center">
              <div className="text-xl font-bold tabular text-navy">{money(recibidoDia)}</div>
              <div className="text-[12px] text-muted-foreground">Recibido en caja ese día · {transDia.length} transacción(es)</div>
            </div>
            <div className="mt-2 space-y-1.5">
              {!transDia.length && <p className="py-4 text-center text-[13px] text-muted-foreground">No hubo transacciones ese día</p>}
              {transDia.map((v) => (
                <div key={v.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                  <Thumb src={fotoDeSku(v.items?.[0]?.sku)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium tabular">{(v.items || []).reduce((a, i) => a + i.cantidad, 0)} par(es) · {money(v.total)}</div>
                    <div className="text-[11.5px] text-muted-foreground">{fmtHora(v.fecha)} · {v.tipo}{v.estado === 'activo' ? ' (apartado activo)' : ''}{v.cliente ? ' · ' + v.cliente.nombre : ''}</div>
                    <div className="truncate text-[11px] text-primary/80">{(v.items || []).map((i) => i.nombre).join(', ')}</div>
                  </div>
                  {esCeo && <Button size="icon" variant="destructive" onClick={() => eliminarVenta(v)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader><CardTitle>Ventas por modelo</CardTitle></CardHeader>
          <CardContent>
            <Label>Elige un modelo (ver quién lo compró y cuándo)</Label>
            <Select value={modeloRep} onChange={(e) => setModeloRep(e.target.value)}>
              <option value="">— Elige un modelo —</option>
              {modelosOpc.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </Select>
            {ventasModelo && (
              <>
                <div className="mt-3 rounded-lg border bg-secondary/50 p-3 text-center">
                  <div className="text-xl font-bold tabular text-navy">{ventasModelo.pares} par(es)</div>
                  <div className="text-[12px] text-muted-foreground">vendidos de este modelo · {ventasModelo.res.length} venta(s)</div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {!ventasModelo.res.length && <p className="py-4 text-center text-[13px] text-muted-foreground">No hay ventas de ese modelo todavía</p>}
                  {ventasModelo.res.map((v) => {
                    const its = (v.items || []).filter((it) => ventasModelo.skus.has(it.sku));
                    return (
                      <div key={v.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                        <Thumb src={fotoDeSku(its[0]?.sku)} size={38} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{its.map((i) => i.nombre).join(', ')}</div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {fmtFecha(v.fecha)} {fmtHora(v.fecha)} · {v.tipo}{v.estado === 'activo' ? ' (apartado)' : ''}{v.cliente ? ' · ' + v.cliente.nombre : ' · sin clienta'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader><CardTitle>Modelos más vendidos</CardTitle></CardHeader>
          <CardContent><Barras obj={stats.mModelo} /></CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Colores más vendidos</CardTitle></CardHeader>
          <CardContent><Barras obj={stats.mColor} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
