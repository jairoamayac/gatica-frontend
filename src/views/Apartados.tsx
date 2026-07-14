import { useState } from 'react';
import { useStore } from '@/store';
import { db } from '@/lib/api';
import { METODOS, ahoraISO, diasDesde, fmtFecha, getAbonos, metodoLabel, money, sumAbonos } from '@/lib/utils';
import type { Venta } from '@/lib/types';
import { imprimirNotaEntrega, numeroNota } from '@/lib/notaEntrega';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';

export function Apartados() {
  const { ventas, inventario, esCeo, recargarInv, recargarVen } = useStore();
  // Todo lo que tiene saldo pendiente: apartados clásicos Y ventas a crédito
  const activos = ventas.filter((v) => v.estado === 'activo');
  const [abonando, setAbonando] = useState<Venta | null>(null);

  async function pagarSaldo(v: Venta) {
    const pagado = sumAbonos(v);
    const rem = Math.max(0, (v.total || 0) - pagado);
    const abonos = [...getAbonos(v)];
    if (rem > 0) abonos.push({ fecha: ahoraISO(), monto: rem, metodo: 'efectivo_usd', moneda: 'USD' });
    const { error } = await db({ table: 'ventas', action: 'update', values: { abonos, abono: v.total, saldo: 0, estado: 'pagado' }, filters: [{ type: 'eq', column: 'id', value: v.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await recargarVen();
  }

  async function cancelar(v: Venta) {
    if (!confirm('¿Cancelar y devolver el stock?')) return;
    for (const c of v.items || []) {
      const it = inventario.find((x) => x.sku === c.sku);
      if (it) await db({ table: 'inventario', action: 'update', values: { stock: it.stock + c.cantidad }, filters: [{ type: 'eq', column: 'sku', value: c.sku }] });
    }
    await db({ table: 'ventas', action: 'update', values: { estado: 'cancelado' }, filters: [{ type: 'eq', column: 'id', value: v.id }] });
    await Promise.all([recargarInv(), recargarVen()]);
  }

  async function eliminar(v: Venta) {
    if (!confirm(`¿Eliminar ${numeroNota(v.id)}?\nEl stock de los zapatos volverá al inventario.`)) return;
    const adminCode = prompt('Escribe el código de la administradora para confirmar:');
    if (!adminCode) return;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apartados y deudas activas ({activos.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {!activos.length && <p className="py-8 text-center text-[13px] text-muted-foreground">No hay apartados ni deudas activas</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {activos.map((v) => {
            const pagado = sumAbonos(v);
            const saldo = Math.max(0, (v.total || 0) - pagado);
            const pct = v.total ? Math.min(100, Math.round((pagado / v.total) * 100)) : 0;
            const dias = diasDesde(v.fecha);
            return (
              <div key={v.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold">{v.cliente?.nombre || 'Sin clienta'}
                      <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">{numeroNota(v.id)}</span>
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {fmtFecha(v.fecha)} · hace {dias} día(s) · {(v.items || []).map((i) => i.nombre).join(', ')}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={v.tipo === 'apartado' ? 'default' : 'low'}>{v.tipo === 'apartado' ? 'Apartado' : 'Venta a crédito'}</Badge>
                    <Badge variant="indigo">{pct}%</Badge>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: pct + '%' }} />
                </div>
                <div className="mt-2 text-[13px] tabular">
                  Total {money(v.total)} · Abonado {money(pagado)} · <b>Saldo {money(saldo)}</b>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Abonos: {getAbonos(v).map((a) => `${money(+a.monto || 0)}${a.metodo ? ' ' + metodoLabel(a.metodo) : ''} (${fmtFecha(a.fecha)})`).join(', ') || '—'}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => setAbonando(v)}>+ Abonar</Button>
                  <Button size="sm" variant="soft" onClick={() => pagarSaldo(v)}>Pagar saldo</Button>
                  <Button size="sm" variant="secondary" onClick={() => imprimirNotaEntrega(v)}>Nota</Button>
                  <Button size="sm" variant="secondary" onClick={() => cancelar(v)}>Cancelar</Button>
                  {esCeo && <Button size="sm" variant="destructive" onClick={() => eliminar(v)}>Eliminar</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      {abonando && <AbonoDialog venta={abonando} onClose={() => setAbonando(null)} recargar={recargarVen} />}
    </Card>
  );
}

function AbonoDialog({ venta, onClose, recargar }: { venta: Venta; onClose: () => void; recargar: () => Promise<void> }) {
  const pagado = sumAbonos(venta);
  const saldoActual = Math.max(0, (venta.total || 0) - pagado);
  const [metodo, setMetodo] = useState(METODOS[0].id);
  const [monto, setMonto] = useState('');
  const [bs, setBs] = useState('');
  const [tasa, setTasa] = useState(() => localStorage.getItem('gatica_tasa') || '');
  const moneda = METODOS.find((m) => m.id === metodo)?.moneda ?? 'USD';
  const montoUSD = moneda === 'BS' ? Math.round(((+bs || 0) / (+tasa || 1)) * 100) / 100 : +monto || 0;

  async function guardar() {
    if (montoUSD <= 0) { alert('Indica el monto del abono.'); return; }
    if (moneda === 'BS' && (+tasa || 0) <= 0) { alert('Indica la tasa Bs/$.'); return; }
    if (moneda === 'BS') localStorage.setItem('gatica_tasa', tasa);
    const abonos = [...getAbonos(venta), { fecha: ahoraISO(), monto: montoUSD, metodo, moneda, ...(moneda === 'BS' ? { tasa: +tasa, montoBs: +bs } : {}) }];
    const nuevoPagado = abonos.reduce((a, x) => a + (+x.monto || 0), 0);
    const nuevoSaldo = Math.max(0, (venta.total || 0) - nuevoPagado);
    const { error } = await db({ table: 'ventas', action: 'update', values: { abonos, abono: nuevoPagado, saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagado' : 'activo' }, filters: [{ type: 'eq', column: 'id', value: venta.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await recargar();
    onClose();
    alert('Abono registrado ✓' + (nuevoSaldo <= 0 ? '\n¡Pagado completo!' : '\nNuevo saldo: ' + money(nuevoSaldo)));
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title="Registrar abono" description={`${venta.cliente?.nombre || 'Sin clienta'} · Saldo actual: ${money(saldoActual)}`} />
      <DialogBody>
        <Label>Método de pago</Label>
        <select value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)}
          className="flex h-9 w-full appearance-none rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {METODOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {moneda === 'BS' ? (
          <div className="grid grid-cols-2 gap-x-3">
            <div><Label>Monto (Bs)</Label><Input type="number" inputMode="decimal" value={bs} onChange={(e) => setBs(e.target.value)} placeholder="0" /></div>
            <div><Label>Tasa Bs/$</Label><Input type="number" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="0" /></div>
            <div className="col-span-2 mt-1 text-[12px] text-muted-foreground tabular">Equivale a {money(montoUSD)}</div>
          </div>
        ) : (
          <><Label>Monto (USD)</Label><Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" /></>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar}>Registrar abono</Button>
      </DialogFooter>
    </Dialog>
  );
}
