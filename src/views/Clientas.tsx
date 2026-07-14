import { useMemo, useState } from 'react';
import { Cake, ChevronRight, Pencil, UserRound } from 'lucide-react';
import { useStore } from '@/store';
import { db } from '@/lib/api';
import { diasDesde, edad, fmtFecha, fmtHora, getAbonos, metodoLabel, money, norm, sumAbonos } from '@/lib/utils';
import type { Clienta, Venta } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { imprimirNotaEntrega, numeroNota } from '@/lib/notaEntrega';

// La columna `cumple` es opcional en la BD. Si no existe, el guardado la omite
// automáticamente (así no se rompe nada mientras no corran el SQL que la crea).
const esErrorColumnaCumple = (msg: string) => /cumple/i.test(msg) && /column|columna/i.test(msg);

export function Clientas() {
  const { clientas, ventas, esCeo, recargarCli } = useStore();
  const [q, setQ] = useState('');
  const [nueva, setNueva] = useState({ nombre: '', telefono: '', cedula: '', nota: '', cumple: '' });
  const [editando, setEditando] = useState<Clienta | null>(null);
  const [detalle, setDetalle] = useState<Clienta | null>(null);

  const soportaCumple = useMemo(() => clientas.some((c) => 'cumple' in c), [clientas]);

  const lista = useMemo(() => {
    const nq = norm(q);
    return clientas.filter((c) => norm(`${c.nombre} ${c.telefono || ''} ${c.cedula || ''}`).includes(nq));
  }, [clientas, q]);

  async function guardar() {
    if (!nueva.nombre.trim()) { alert('Falta el nombre'); return; }
    const base = { nombre: nueva.nombre.trim(), telefono: nueva.telefono, cedula: nueva.cedula, nota: nueva.nota };
    const conCumple = nueva.cumple ? { ...base, cumple: nueva.cumple } : base;
    let { error } = await db({ table: 'clientas', action: 'insert', values: conCumple });
    if (error && esErrorColumnaCumple(error.message)) {
      ({ error } = await db({ table: 'clientas', action: 'insert', values: base }));
      if (!error) alert('Guardada ✓ (sin fecha de nacimiento: la base de datos aún no tiene esa columna — pídeme el SQL para activarla)');
    }
    if (error) { alert('Error:\n' + error.message); return; }
    setNueva({ nombre: '', telefono: '', cedula: '', nota: '', cumple: '' });
    await recargarCli();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="self-start lg:col-span-2">
        <CardHeader><CardTitle>Agregar clienta</CardTitle></CardHeader>
        <CardContent>
          <Label>Nombre</Label><Input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre y apellido" />
          <Label>Teléfono</Label><Input inputMode="tel" value={nueva.telefono} onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} placeholder="Opcional" />
          <Label>Cédula</Label><Input inputMode="numeric" value={nueva.cedula} onChange={(e) => setNueva({ ...nueva, cedula: e.target.value })} placeholder="Opcional" />
          <Label>Fecha de nacimiento</Label><Input type="date" value={nueva.cumple} onChange={(e) => setNueva({ ...nueva, cumple: e.target.value })} />
          <Label>Nota</Label><Input value={nueva.nota} onChange={(e) => setNueva({ ...nueva, nota: e.target.value })} placeholder="Opcional" />
          <Button className="mt-4 w-full" onClick={guardar}>Guardar clienta</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader><CardTitle>Clientas ({clientas.length})</CardTitle></CardHeader>
        <CardContent>
          <Input placeholder="Buscar clienta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 divide-y">
            {!lista.length && <p className="py-8 text-center text-[13px] text-muted-foreground">No hay clientas todavía</p>}
            {lista.map((c) => {
              const compras = ventas.filter((v) => v.cliente?.id === c.id && v.estado !== 'cancelado');
              const total = compras.reduce((a, v) => a + (v.total || 0), 0);
              const deuda = compras.filter((v) => v.estado === 'activo').reduce((a, v) => a + Math.max(0, (v.total || 0) - sumAbonos(v)), 0);
              const e = edad(c.cumple);
              return (
                <div key={c.id} className="flex cursor-pointer items-start gap-3 py-3 hover:bg-secondary/50" onClick={() => setDetalle(c)}>
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">
                      {c.nombre}{e != null && <span className="ml-1.5 font-normal text-muted-foreground">· {e} años</span>}
                      {deuda > 0 && <Badge variant="out" className="ml-2">debe {money(deuda)}</Badge>}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {c.telefono ? `📞 ${c.telefono} · ` : ''}{c.cedula ? `CI ${c.cedula} · ` : ''}{compras.length} compra(s) · {money(total)} en total
                    </div>
                    {c.nota && <div className="text-[12px] italic text-muted-foreground/80">{c.nota}</div>}
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <Button size="sm" variant="soft" onClick={(ev) => { ev.stopPropagation(); setEditando(c); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {editando && <EditarClienta clienta={editando} esCeo={esCeo} soportaCumple={soportaCumple} onClose={() => setEditando(null)} recargar={recargarCli} />}
      {detalle && <FichaClienta clienta={detalle} ventas={ventas} onClose={() => setDetalle(null)} />}
    </div>
  );
}

/* ===== Ficha de la clienta: todo lo que ha comprado y lo que debe ===== */
function FichaClienta({ clienta, ventas, onClose }: { clienta: Clienta; ventas: Venta[]; onClose: () => void }) {
  const compras = ventas
    .filter((v) => v.cliente?.id === clienta.id && v.estado !== 'cancelado')
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const totalGastado = compras.reduce((a, v) => a + sumAbonos(v), 0);
  const pendientes = compras.filter((v) => v.estado === 'activo');
  const deudaTotal = pendientes.reduce((a, v) => a + Math.max(0, (v.total || 0) - sumAbonos(v)), 0);
  const pares = compras.reduce((a, v) => a + (v.items || []).reduce((x, i) => x + i.cantidad, 0), 0);
  const ultima = compras[0]?.fecha;
  const e = edad(clienta.cumple);

  return (
    <Dialog open onClose={onClose} className="max-w-2xl">
      <DialogHeader
        title={clienta.nombre + (e != null ? ` · ${e} años` : '')}
        description={[clienta.telefono && `📞 ${clienta.telefono}`, clienta.cedula && `CI ${clienta.cedula}`, clienta.cumple && `🎂 ${fmtFecha(clienta.cumple + 'T12:00:00')}`, clienta.nota].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
      />
      <DialogBody>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { b: String(compras.length), s: 'Compras' },
            { b: String(pares), s: 'Pares' },
            { b: money(totalGastado), s: 'Pagado en total' },
            { b: money(deudaTotal), s: 'Debe', rojo: deudaTotal > 0 },
          ].map((x) => (
            <div key={x.s} className={`rounded-lg border p-3 text-center ${x.rojo ? 'border-red-200 bg-red-50/60' : 'bg-secondary/40'}`}>
              <div className={`text-lg font-bold tabular ${x.rojo ? 'text-red-700' : 'text-navy'}`}>{x.b}</div>
              <div className="text-[11px] text-muted-foreground">{x.s}</div>
            </div>
          ))}
        </div>
        {ultima && <p className="mt-2 text-[12px] text-muted-foreground">Última compra: {fmtFecha(ultima)} (hace {diasDesde(ultima)} día(s))</p>}

        {pendientes.length > 0 && (
          <>
            <h4 className="mt-4 text-[13px] font-semibold text-red-700">Pendiente por pagar</h4>
            <div className="mt-1.5 space-y-1.5">
              {pendientes.map((v) => (
                <div key={v.id} className="rounded-lg border border-red-200 bg-red-50/40 px-3 py-2">
                  <div className="text-[13px] font-medium">{(v.items || []).map((i) => i.nombre).join(', ')}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {v.tipo === 'apartado' ? 'Apartado' : 'Venta a crédito'} · desde {fmtFecha(v.fecha)} (hace {diasDesde(v.fecha)} días)
                  </div>
                  <div className="text-[12.5px] tabular">Total {money(v.total)} · Abonado {money(sumAbonos(v))} · <b className="text-red-700">Debe {money(Math.max(0, (v.total || 0) - sumAbonos(v)))}</b></div>
                </div>
              ))}
            </div>
          </>
        )}

        <h4 className="mt-4 text-[13px] font-semibold">Historial de compras</h4>
        <div className="mt-1.5 max-h-72 space-y-1.5 overflow-auto">
          {!compras.length && <p className="py-4 text-center text-[13px] text-muted-foreground">Todavía no ha comprado nada</p>}
          {compras.map((v) => {
            const metodos = [...new Set(getAbonos(v).map((a) => metodoLabel(a.metodo)).filter(Boolean))].join(', ');
            return (
              <div key={v.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-medium">
                    <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{numeroNota(v.id)}</span>
                    {(v.items || []).map((i) => `${i.nombre} ×${i.cantidad}`).join(', ')}
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <Badge variant={v.estado === 'pagado' ? 'ok' : 'low'}>{v.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</Badge>
                    <Button size="xs" variant="soft" onClick={() => imprimirNotaEntrega(v)}>Nota</Button>
                  </div>
                </div>
                <div className="text-[11.5px] text-muted-foreground tabular">
                  {fmtFecha(v.fecha)} {fmtHora(v.fecha)} · {v.tipo} · {money(v.total)}{metodos ? ' · ' + metodos : ''}
                </div>
              </div>
            );
          })}
        </div>
      </DialogBody>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Cerrar</Button></DialogFooter>
    </Dialog>
  );
}

function EditarClienta({ clienta, esCeo, soportaCumple, onClose, recargar }: { clienta: Clienta; esCeo: boolean; soportaCumple: boolean; onClose: () => void; recargar: () => Promise<void> }) {
  const [f, setF] = useState({ nombre: clienta.nombre || '', telefono: clienta.telefono || '', cedula: clienta.cedula || '', nota: clienta.nota || '', cumple: clienta.cumple || '' });

  async function guardar() {
    if (!f.nombre.trim()) { alert('Falta el nombre'); return; }
    const base = { nombre: f.nombre.trim(), telefono: f.telefono, cedula: f.cedula, nota: f.nota };
    const values = soportaCumple || f.cumple ? { ...base, cumple: f.cumple || null } : base;
    let { error } = await db({ table: 'clientas', action: 'update', values, filters: [{ type: 'eq', column: 'id', value: clienta.id }] });
    if (error && esErrorColumnaCumple(error.message)) {
      ({ error } = await db({ table: 'clientas', action: 'update', values: base, filters: [{ type: 'eq', column: 'id', value: clienta.id }] }));
      if (!error) alert('Guardada ✓ (sin fecha de nacimiento: falta activar esa columna en la base de datos)');
    }
    if (error) { alert('Error:\n' + error.message); return; }
    await recargar();
    onClose();
  }

  async function eliminar() {
    if (!confirm('¿Eliminar esta clienta?')) return;
    const { error } = await db({ table: 'clientas', action: 'delete', filters: [{ type: 'eq', column: 'id', value: clienta.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await recargar();
    onClose();
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title="Editar clienta" />
      <DialogBody>
        <Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Label>Teléfono</Label><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <Label>Cédula</Label><Input value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value })} />
        <Label className="flex items-center gap-1"><Cake className="h-3.5 w-3.5" /> Fecha de nacimiento</Label>
        <Input type="date" value={f.cumple} onChange={(e) => setF({ ...f, cumple: e.target.value })} />
        <Label>Nota</Label><Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
      </DialogBody>
      <DialogFooter>
        {esCeo && <Button variant="destructive" onClick={eliminar}>Eliminar</Button>}
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar}>Guardar</Button>
      </DialogFooter>
    </Dialog>
  );
}
