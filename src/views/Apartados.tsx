import { useStore } from '@/store';
import { db } from '@/lib/api';
import { ahoraISO, fmtFecha, getAbonos, money, sumAbonos } from '@/lib/utils';
import type { Venta } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Apartados() {
  const { ventas, inventario, esCeo, recargarInv, recargarVen } = useStore();
  const activos = ventas.filter((v) => v.tipo === 'apartado' && v.estado === 'activo');

  async function abonar(v: Venta) {
    const pagado = sumAbonos(v);
    const saldo = Math.max(0, (v.total || 0) - pagado);
    const m = parseFloat(prompt(`Monto del nuevo abono (USD). Saldo actual: $${saldo}`) || '');
    if (!m || m <= 0) return;
    const abonos = [...getAbonos(v), { fecha: ahoraISO(), monto: m }];
    const nuevoPagado = abonos.reduce((a, x) => a + (+x.monto || 0), 0);
    const nuevoSaldo = Math.max(0, (v.total || 0) - nuevoPagado);
    const { error } = await db({ table: 'ventas', action: 'update', values: { abonos, abono: nuevoPagado, saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagado' : 'activo' }, filters: [{ type: 'eq', column: 'id', value: v.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await recargarVen();
    alert('Abono registrado ✓' + (nuevoSaldo <= 0 ? '\n¡Apartado pagado completo!' : '\nNuevo saldo: $' + nuevoSaldo));
  }

  async function pagarSaldo(v: Venta) {
    const pagado = sumAbonos(v);
    const rem = Math.max(0, (v.total || 0) - pagado);
    const abonos = [...getAbonos(v)];
    if (rem > 0) abonos.push({ fecha: ahoraISO(), monto: rem });
    const { error } = await db({ table: 'ventas', action: 'update', values: { abonos, abono: v.total, saldo: 0, estado: 'pagado' }, filters: [{ type: 'eq', column: 'id', value: v.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await recargarVen();
  }

  async function cancelar(v: Venta) {
    if (!confirm('¿Cancelar apartado y devolver el stock?')) return;
    for (const c of v.items || []) {
      const it = inventario.find((x) => x.sku === c.sku);
      if (it) await db({ table: 'inventario', action: 'update', values: { stock: it.stock + c.cantidad }, filters: [{ type: 'eq', column: 'sku', value: c.sku }] });
    }
    await db({ table: 'ventas', action: 'update', values: { estado: 'cancelado' }, filters: [{ type: 'eq', column: 'id', value: v.id }] });
    await Promise.all([recargarInv(), recargarVen()]);
  }

  async function eliminar(v: Venta) {
    if (!confirm('¿Eliminar este apartado?\nEl stock de los zapatos volverá al inventario.')) return;
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

  return (
    <Card>
      <CardHeader><CardTitle>Apartados activos ({activos.length})</CardTitle></CardHeader>
      <CardContent>
        {!activos.length && <p className="py-8 text-center text-[13px] text-muted-foreground">No hay apartados activos</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {activos.map((v) => {
            const pagado = sumAbonos(v);
            const saldo = Math.max(0, (v.total || 0) - pagado);
            const pct = v.total ? Math.min(100, Math.round((pagado / v.total) * 100)) : 0;
            return (
              <div key={v.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold">{v.cliente?.nombre || 'Sin clienta'}</div>
                    <div className="text-[12px] text-muted-foreground">{fmtFecha(v.fecha)} · {(v.items || []).map((i) => i.nombre).join(', ')}</div>
                  </div>
                  <Badge variant="indigo">{pct}%</Badge>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: pct + '%' }} />
                </div>
                <div className="mt-2 text-[13px] tabular">
                  Total {money(v.total)} · Abonado {money(pagado)} · <b className="text-navy">Saldo {money(saldo)}</b>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Abonos: {getAbonos(v).map((a) => `${money(+a.monto || 0)} (${fmtFecha(a.fecha)})`).join(', ')}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => abonar(v)}>+ Abonar</Button>
                  <Button size="sm" variant="soft" onClick={() => pagarSaldo(v)}>Pagar saldo</Button>
                  <Button size="sm" variant="secondary" onClick={() => cancelar(v)}>Cancelar</Button>
                  {esCeo && <Button size="sm" variant="destructive" onClick={() => eliminar(v)}>Eliminar</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
