import { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Trash2 } from 'lucide-react';
import { imprimirNotaEntrega, numeroNota } from '@/lib/notaEntrega';
import { useStore } from '@/store';
import { db } from '@/lib/api';
import { diasDesde, edad, fmtFecha, fmtHora, getAbonos, hoyVz, metodoLabel, modeloKey, money, sumAbonos } from '@/lib/utils';
import { exportarVentas } from '@/lib/excel';
import type { Venta } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Thumb } from '@/components/Thumb';
import { cn } from '@/lib/utils';

type Periodo = 'hoy' | 'ayer' | '7d' | 'mes' | 'mesPasado' | 'todo' | 'custom';

function rangoDe(p: Periodo, desde: string, hasta: string): [string, string] {
  const hoy = hoyVz();
  const d = new Date(hoy + 'T12:00:00');
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (p) {
    case 'hoy': return [hoy, hoy];
    case 'ayer': { const a = new Date(d); a.setDate(a.getDate() - 1); return [iso(a), iso(a)]; }
    case '7d': { const a = new Date(d); a.setDate(a.getDate() - 6); return [iso(a), hoy]; }
    case 'mes': return [hoy.slice(0, 7) + '-01', hoy];
    case 'mesPasado': {
      const a = new Date(d); a.setDate(1); a.setDate(0); // último día del mes pasado
      return [iso(a).slice(0, 7) + '-01', iso(a)];
    }
    case 'todo': return ['0000-01-01', '9999-12-31'];
    case 'custom': return [desde || '0000-01-01', hasta || '9999-12-31'];
  }
}

export function Reportes() {
  const { ventas, inventario, clientas, fotosMap, esCeo, recargarInv, recargarVen } = useStore();
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [desde, setDesde] = useState(hoyVz());
  const [hasta, setHasta] = useState(hoyVz());
  const [modeloRep, setModeloRep] = useState('');

  const vald = useMemo(() => ventas.filter((v) => v.estado !== 'cancelado'), [ventas]);
  const [ini, fin] = rangoDe(periodo, desde, hasta);
  const enRango = (f?: string | null) => { const d = (f || '').slice(0, 10); return d >= ini && d <= fin; };

  /* ===== Métricas del período ===== */
  const m = useMemo(() => {
    let recibido = 0, pares = 0, totalVendido = 0, ganancia = 0, nVentas = 0;
    const porMetodo: Record<string, number> = {};
    const mModelo: Record<string, number> = {}, mColor: Record<string, number> = {};
    const transacciones: Venta[] = [];

    vald.forEach((v) => {
      // Caja: cada abono cuenta en el día en que se recibió
      getAbonos(v).forEach((ab) => {
        if (enRango(ab.fecha)) {
          const mo = +ab.monto || 0;
          recibido += mo;
          const key = metodoLabel(ab.metodo) || 'Sin registrar';
          porMetodo[key] = (porMetodo[key] || 0) + mo;
        }
      });
      // Transacciones: por fecha de la venta
      if (enRango(v.fecha)) {
        nVentas++;
        totalVendido += v.total || 0;
        transacciones.push(v);
        (v.items || []).forEach((it) => {
          pares += it.cantidad;
          const inv = inventario.find((x) => x.sku === it.sku);
          mModelo[inv ? inv.modelo : it.nombre || '?'] = (mModelo[inv ? inv.modelo : it.nombre || '?'] || 0) + it.cantidad;
          mColor[inv ? inv.color : '?'] = (mColor[inv ? inv.color : '?'] || 0) + it.cantidad;
          ganancia += (it.precio - (inv?.costo || 0)) * it.cantidad;
        });
      }
    });
    transacciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return { recibido, pares, totalVendido, ganancia, nVentas, porMetodo, mModelo, mColor, transacciones };
  }, [vald, inventario, ini, fin]);

  /* ===== Deudas (independiente del período) ===== */
  const deudas = useMemo(() => {
    const d = vald
      .filter((v) => v.estado === 'activo')
      .map((v) => ({ v, pagado: sumAbonos(v), saldo: Math.max(0, (v.total || 0) - sumAbonos(v)), dias: diasDesde(v.fecha) }))
      .filter((x) => x.saldo > 0)
      .sort((a, b) => b.dias - a.dias);
    return { lista: d, total: d.reduce((a, x) => a + x.saldo, 0) };
  }, [vald]);

  /* ===== Analítica de clientas ===== */
  const cli = useMemo(() => {
    // Gasto por clienta dentro del período (por abonos recibidos)
    const gasto: Record<number, number> = {};
    let conClienta = 0, sinClienta = 0;
    vald.forEach((v) => {
      if (enRango(v.fecha)) { v.cliente ? conClienta++ : sinClienta++; }
      if (v.cliente) {
        getAbonos(v).forEach((ab) => { if (enRango(ab.fecha)) gasto[v.cliente!.id] = (gasto[v.cliente!.id] || 0) + (+ab.monto || 0); });
      }
    });
    const top = Object.entries(gasto)
      .map(([id, monto]) => ({ c: clientas.find((x) => x.id === +id), monto }))
      .filter((x) => x.c && x.monto > 0)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);

    // Última compra por clienta (histórico) → inactivas hace más de 60 días
    const ultima: Record<number, string> = {};
    vald.forEach((v) => {
      if (v.cliente && (!ultima[v.cliente.id] || (v.fecha || '') > ultima[v.cliente.id])) ultima[v.cliente.id] = v.fecha || '';
    });
    const inactivas = Object.entries(ultima)
      .map(([id, f]) => ({ c: clientas.find((x) => x.id === +id), dias: diasDesde(f) }))
      .filter((x) => x.c && x.dias > 60)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5);

    // Demografía (solo si hay fechas de nacimiento cargadas)
    const edades = clientas.map((c) => edad(c.cumple)).filter((e): e is number => e != null);
    const rangos: Record<string, number> = {};
    edades.forEach((e) => {
      const r = e < 20 ? '< 20' : e < 30 ? '20–29' : e < 40 ? '30–39' : e < 50 ? '40–49' : '50+';
      rangos[r] = (rangos[r] || 0) + 1;
    });
    const mesActual = hoyVz().slice(5, 7);
    const cumpleaneras = clientas.filter((c) => c.cumple && c.cumple.slice(5, 7) === mesActual);

    return { top, conClienta, sinClienta, inactivas, edades, rangos, cumpleaneras };
  }, [vald, clientas, ini, fin]);

  const modelosOpc = useMemo(() => {
    const mm = new Map<string, string>();
    inventario.forEach((i) => { const k = modeloKey(i); if (!mm.has(k)) mm.set(k, `${i.marca} ${i.modelo}${i.color ? ' · ' + i.color : ''}`); });
    return [...mm.entries()];
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
    if (!confirm(`¿Eliminar ${numeroNota(v.id)} (${v.tipo})?\nEl stock de los zapatos volverá al inventario.`)) return;
    const adminCode = prompt('Escribe el código de la administradora para confirmar:');
    if (!adminCode) return;
    // Primero se valida el código borrando la venta; solo si pasa, se devuelve el stock.
    const { error } = await db({ table: 'ventas', action: 'delete', filters: [{ type: 'eq', column: 'id', value: v.id }], adminCode });
    if (error) { alert('Error:\n' + error.message); return; }
    if (v.estado !== 'cancelado') {
      for (const c of v.items || []) {
        const it = inventario.find((x) => x.sku === c.sku);
        if (it) await db({ table: 'inventario', action: 'update', values: { stock: it.stock + c.cantidad }, filters: [{ type: 'eq', column: 'sku', value: c.sku }] });
      }
    }
    await Promise.all([recargarInv(), recargarVen()]);
  }

  const Metric = ({ big, small, alerta }: { big: string; small: string; alerta?: boolean }) => (
    <div className={cn('rounded-lg border bg-white p-4', alerta && 'border-red-200 bg-red-50/50')}>
      <div className="text-[12px] font-medium text-muted-foreground">{small}</div>
      <div className={cn('mt-1 text-2xl font-bold tabular', alerta ? 'text-red-700' : 'text-navy')}>{big}</div>
    </div>
  );

  const Barras = ({ obj }: { obj: Record<string, number> }) => {
    const arr = Object.entries(obj).filter(([k]) => k && k !== '?').sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!arr.length) return <p className="py-4 text-center text-[13px] text-muted-foreground">Sin datos en este período</p>;
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

  const PERIODOS: { id: Periodo; label: string }[] = [
    { id: 'hoy', label: 'Hoy' }, { id: 'ayer', label: 'Ayer' }, { id: '7d', label: '7 días' },
    { id: 'mes', label: 'Este mes' }, { id: 'mesPasado', label: 'Mes pasado' }, { id: 'todo', label: 'Todo' }, { id: 'custom', label: 'Rango…' },
  ];

  return (
    <div className="space-y-4">
      {/* ===== Filtro de período ===== */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
            className={cn('rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
              periodo === p.id ? 'border-navy bg-navy text-white' : 'bg-white text-foreground hover:bg-secondary')}>
            {p.label}
          </button>
        ))}
        {periodo === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-auto" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 w-auto" />
          </div>
        )}
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => exportarVentas(ventas)}>
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {/* ===== Métricas del período ===== */}
      <div className={`grid gap-3 grid-cols-2 ${esCeo ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <Metric big={money(m.recibido)} small="Recibido en caja" />
        <Metric big={String(m.nVentas)} small="Transacciones" />
        <Metric big={String(m.pares)} small="Pares vendidos" />
        <Metric big={m.nVentas ? money(m.totalVendido / m.nVentas) : '$0'} small="Ticket promedio" />
        {esCeo && <Metric big={money(Math.round(m.ganancia))} small="Ganancia estimada" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== Deudas ===== */}
        <Card className={deudas.lista.length ? 'border-amber-200' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Deudas pendientes · {money(deudas.total)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!deudas.lista.length && <p className="py-4 text-center text-[13px] text-muted-foreground">Nadie debe nada 🎉</p>}
            <div className="space-y-1.5">
              {deudas.lista.map(({ v, pagado, saldo, dias }) => (
                <div key={v.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">{v.cliente?.nombre || 'Sin clienta'}
                      <Badge variant={dias > 30 ? 'out' : dias > 14 ? 'low' : 'default'} className="ml-2">hace {dias} día(s)</Badge>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      desde {fmtFecha(v.fecha)} · {v.tipo === 'apartado' ? 'apartado' : 'venta a crédito'} · {(v.items || []).map((i) => i.nombre).join(', ')}
                    </div>
                    <div className="text-[12.5px] tabular">Total {money(v.total)} · Abonado {money(pagado)} · <b className="text-red-700">Debe {money(saldo)}</b></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ===== Caja por método de pago ===== */}
        <Card className="self-start">
          <CardHeader><CardTitle>Caja por método de pago</CardTitle></CardHeader>
          <CardContent>
            {!Object.keys(m.porMetodo).length && <p className="py-4 text-center text-[13px] text-muted-foreground">Sin pagos en este período</p>}
            <div className="divide-y">
              {Object.entries(m.porMetodo).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2 text-[13.5px]">
                  <span>{k}</span>
                  <b className="tabular">{money(v)}</b>
                </div>
              ))}
              {Object.keys(m.porMetodo).length > 0 && (
                <div className="flex items-center justify-between py-2 text-[13.5px] font-bold">
                  <span>Total</span><span className="tabular">{money(m.recibido)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ===== Clientas ===== */}
        <Card className="self-start">
          <CardHeader><CardTitle>Clientas</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-secondary/40 p-3 text-center">
                <div className="text-lg font-bold tabular text-navy">{cli.conClienta + cli.sinClienta ? Math.round((cli.conClienta / (cli.conClienta + cli.sinClienta)) * 100) : 0}%</div>
                <div className="text-[11px] text-muted-foreground">ventas con clienta asignada</div>
              </div>
              <div className="rounded-lg border bg-secondary/40 p-3 text-center">
                <div className="text-lg font-bold tabular text-navy">{clientas.length}</div>
                <div className="text-[11px] text-muted-foreground">clientas registradas</div>
              </div>
            </div>

            <h4 className="text-[12.5px] font-semibold text-muted-foreground">Top compradoras del período</h4>
            <div className="mt-1 divide-y">
              {!cli.top.length && <p className="py-3 text-center text-[12.5px] text-muted-foreground">Sin compras con clienta en este período</p>}
              {cli.top.map(({ c, monto }, idx) => (
                <div key={c!.id} className="flex items-center justify-between py-1.5 text-[13px]">
                  <span className="truncate"><span className="mr-1.5 text-muted-foreground">{idx + 1}.</span>{c!.nombre}{edad(c!.cumple) != null ? ` · ${edad(c!.cumple)} años` : ''}</span>
                  <b className="tabular">{money(monto)}</b>
                </div>
              ))}
            </div>

            {cli.inactivas.length > 0 && (
              <>
                <h4 className="mt-3 text-[12.5px] font-semibold text-muted-foreground">No vuelven hace más de 60 días</h4>
                <div className="mt-1 space-y-1">
                  {cli.inactivas.map(({ c, dias }) => (
                    <div key={c!.id} className="flex items-center justify-between text-[12.5px]">
                      <span className="truncate">{c!.nombre}</span>
                      <Badge variant="low">hace {dias} días</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}

            {cli.edades.length > 0 ? (
              <>
                <h4 className="mt-3 text-[12.5px] font-semibold text-muted-foreground">Edades ({cli.edades.length} con fecha de nacimiento)</h4>
                <div className="mt-1 space-y-1.5">
                  {Object.entries(cli.rangos).sort().map(([r, n]) => (
                    <div key={r} className="flex items-center gap-2 text-[12.5px]">
                      <span className="w-12">{r}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-secondary">
                        <div className="h-full rounded bg-primary" style={{ width: Math.round((n / cli.edades.length) * 100) + '%' }} />
                      </div>
                      <b className="tabular">{n}</b>
                    </div>
                  ))}
                </div>
                {cli.cumpleaneras.length > 0 && (
                  <p className="mt-2 text-[12.5px]">🎂 Cumplen este mes: <b>{cli.cumpleaneras.map((c) => c.nombre).join(', ')}</b></p>
                )}
              </>
            ) : (
              <p className="mt-3 text-[11.5px] text-muted-foreground">
                Tip: registra la fecha de nacimiento de las clientas (pestaña Clientas) para ver edades y cumpleañeras del mes aquí.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ===== Transacciones del período ===== */}
        <Card>
          <CardHeader><CardTitle>Transacciones del período ({m.transacciones.length})</CardTitle></CardHeader>
          <CardContent>
            {!m.transacciones.length && <p className="py-4 text-center text-[13px] text-muted-foreground">No hubo transacciones</p>}
            <div className="max-h-[28rem] space-y-1.5 overflow-auto">
              {m.transacciones.map((v) => {
                const pagado = sumAbonos(v);
                const saldo = Math.max(0, (v.total || 0) - pagado);
                const metodos = [...new Set(getAbonos(v).map((a) => metodoLabel(a.metodo)).filter(Boolean))].join(', ');
                return (
                  <div key={v.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                    <Thumb src={fotoDeSku(v.items?.[0]?.sku)} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium tabular">
                        <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{numeroNota(v.id)}</span>
                        {(v.items || []).reduce((a, i) => a + i.cantidad, 0)} par(es) · {money(v.total)}
                        {saldo > 0 && <span className="text-red-700"> · debe {money(saldo)}</span>}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {fmtFecha(v.fecha)} {fmtHora(v.fecha)} · {v.tipo}{v.estado === 'activo' ? ' (pendiente)' : ''}{v.cliente ? ' · ' + v.cliente.nombre : ''}{metodos ? ' · ' + metodos : ''}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground/80">{(v.items || []).map((i) => i.nombre).join(', ')}</div>
                    </div>
                    <Button size="icon" variant="soft" title="Nota de entrega" onClick={() => imprimirNotaEntrega(v)}><FileText className="h-3.5 w-3.5" /></Button>
                    {esCeo && <Button size="icon" variant="destructive" onClick={() => eliminarVenta(v)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ===== Ventas por modelo ===== */}
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
                <div className="mt-2 max-h-72 space-y-1.5 overflow-auto">
                  {!ventasModelo.res.length && <p className="py-4 text-center text-[13px] text-muted-foreground">No hay ventas de ese modelo todavía</p>}
                  {ventasModelo.res.map((v) => {
                    const its = (v.items || []).filter((it) => ventasModelo.skus.has(it.sku));
                    return (
                      <div key={v.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                        <Thumb src={fotoDeSku(its[0]?.sku)} size={38} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{its.map((i) => i.nombre).join(', ')}</div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {fmtFecha(v.fecha)} {fmtHora(v.fecha)} · {v.tipo}{v.estado === 'activo' ? ' (pendiente)' : ''}{v.cliente ? ' · ' + v.cliente.nombre : ' · sin clienta'}
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
          <CardHeader><CardTitle>Modelos más vendidos (período)</CardTitle></CardHeader>
          <CardContent><Barras obj={m.mModelo} /></CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Colores más vendidos (período)</CardTitle></CardHeader>
          <CardContent><Barras obj={m.mColor} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
