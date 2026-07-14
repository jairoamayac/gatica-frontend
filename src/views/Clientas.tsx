import { useMemo, useState } from 'react';
import { Pencil, UserRound } from 'lucide-react';
import { useStore } from '@/store';
import { db } from '@/lib/api';
import { money, norm } from '@/lib/utils';
import type { Clienta } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';

export function Clientas() {
  const { clientas, ventas, esCeo, recargarCli } = useStore();
  const [q, setQ] = useState('');
  const [nueva, setNueva] = useState({ nombre: '', telefono: '', cedula: '', nota: '' });
  const [editando, setEditando] = useState<Clienta | null>(null);

  const lista = useMemo(() => {
    const nq = norm(q);
    return clientas.filter((c) => norm(`${c.nombre} ${c.telefono || ''}`).includes(nq));
  }, [clientas, q]);

  async function guardar() {
    if (!nueva.nombre.trim()) { alert('Falta el nombre'); return; }
    const { error } = await db({ table: 'clientas', action: 'insert', values: { ...nueva, nombre: nueva.nombre.trim() } });
    if (error) { alert('Error:\n' + error.message); return; }
    setNueva({ nombre: '', telefono: '', cedula: '', nota: '' });
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
              return (
                <div key={c.id} className="flex items-start gap-3 py-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{c.nombre}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {c.telefono ? `📞 ${c.telefono} · ` : ''}{c.cedula ? `CI ${c.cedula} · ` : ''}{compras.length} compra(s) · {money(total)} en total
                    </div>
                    {c.nota && <div className="text-[12px] italic text-muted-foreground/80">{c.nota}</div>}
                  </div>
                  <Button size="sm" variant="soft" onClick={() => setEditando(c)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {editando && <EditarClienta clienta={editando} esCeo={esCeo} onClose={() => setEditando(null)} recargar={recargarCli} />}
    </div>
  );
}

function EditarClienta({ clienta, esCeo, onClose, recargar }: { clienta: Clienta; esCeo: boolean; onClose: () => void; recargar: () => Promise<void> }) {
  const [f, setF] = useState({ nombre: clienta.nombre || '', telefono: clienta.telefono || '', cedula: clienta.cedula || '', nota: clienta.nota || '' });

  async function guardar() {
    if (!f.nombre.trim()) { alert('Falta el nombre'); return; }
    const { error } = await db({ table: 'clientas', action: 'update', values: { ...f, nombre: f.nombre.trim() }, filters: [{ type: 'eq', column: 'id', value: clienta.id }] });
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
