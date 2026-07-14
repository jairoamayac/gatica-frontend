import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Plus, X } from 'lucide-react';
import { useStore } from '@/store';
import { db } from '@/lib/api';
import { METODOS, ahoraISO, cn, coincide, modeloKey, money, norm } from '@/lib/utils';
import type { InvItem, Venta, VentaItem } from '@/lib/types';
import { imprimirNotaEntrega, numeroNota } from '@/lib/notaEntrega';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Thumb } from '@/components/Thumb';

export function Ventas() {
  const { inventario, clientas, fotosMap, recargarInv, recargarVen, recargarCli } = useStore();
  const [modo, setModo] = useState<'venta' | 'apartado'>('venta');
  const [q, setQ] = useState('');
  const [carrito, setCarrito] = useState<VentaItem[]>([]);
  const [clienteSel, setClienteSel] = useState<{ id: number; nombre: string } | null>(null);
  const [qCliente, setQCliente] = useState('');
  const [mostrarClientes, setMostrarClientes] = useState(false);
  const [metodo, setMetodo] = useState(METODOS[0].id);
  const [pagado, setPagado] = useState(''); // USD; vacío = total en modo venta, 0 en apartado
  const [bs, setBs] = useState('');
  const [tasa, setTasa] = useState(() => localStorage.getItem('gatica_tasa') || '');
  const [scanAbierto, setScanAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const resultados = useMemo(() => {
    if (!norm(q)) return [];
    return inventario.filter((i) => coincide(i, q)).slice(0, 15);
  }, [q, inventario]);

  const resultadosCliente = useMemo(() => {
    const nq = norm(qCliente);
    let lista = clientas;
    if (nq && !(clienteSel && qCliente === clienteSel.nombre)) {
      lista = clientas.filter((c) => norm(`${c.nombre} ${c.telefono || ''} ${c.cedula || ''}`).includes(nq));
    }
    return lista.slice(0, 8);
  }, [qCliente, clientas, clienteSel]);

  const total = carrito.reduce((a, c) => a + c.precio * c.cantidad, 0);
  const monedaPago = METODOS.find((m) => m.id === metodo)?.moneda ?? 'USD';
  const pagoUSD = monedaPago === 'BS'
    ? Math.round(((+bs || 0) / (+tasa || 1)) * 100) / 100
    : pagado === '' ? (modo === 'venta' ? total : 0) : +pagado || 0;
  const saldo = Math.max(0, total - pagoUSD);
  const quedaDebiendo = carrito.length > 0 && saldo > 0;

  function agregar(i: InvItem) {
    if (i.stock <= 0) { alert('Sin stock disponible'); return; }
    setCarrito((prev) => {
      const e = prev.find((c) => c.sku === i.sku);
      if (e) {
        if (e.cantidad >= i.stock) { alert('No hay más stock de ' + i.sku); return prev; }
        return prev.map((c) => (c.sku === i.sku ? { ...c, cantidad: c.cantidad + 1 } : c));
      }
      return [...prev, { sku: i.sku, nombre: `${i.marca} ${i.modelo} T${i.talla}`, precio: i.precio, cantidad: 1 }];
    });
    setQ('');
  }

  function onScan(texto: string) {
    const t = texto.trim();
    const n = parseInt(t, 10);
    const i = inventario.find((x) => x.id === n) || inventario.find((x) => x.sku === t);
    if (i) {
      agregar(i);
      navigator.vibrate?.(80);
    } else alert('Código no encontrado:\n' + texto);
    setScanAbierto(false);
  }

  async function confirmar() {
    if (!carrito.length) { alert('El carrito está vacío'); return; }
    setGuardando(true);
    try {
      if (quedaDebiendo && !clienteSel) {
        if (!confirm(`Queda debiendo ${money(saldo)} y no elegiste clienta.\n¿Registrar la deuda sin clienta? (Recomendado: asignar clienta para poder cobrar después)`)) return;
      }
      if (monedaPago === 'BS' && (+tasa || 0) <= 0) { alert('Indica la tasa Bs/$ para registrar el pago en bolívares.'); return; }
      if (monedaPago === 'BS') localStorage.setItem('gatica_tasa', tasa);
      const ahora = ahoraISO();
      const estado = saldo > 0 ? 'activo' : 'pagado';
      const primerAbono = {
        fecha: ahora, monto: pagoUSD, metodo, moneda: monedaPago,
        ...(monedaPago === 'BS' ? { tasa: +tasa || 0, montoBs: +bs || 0 } : {}),
      };
      const reg = {
        tipo: modo, items: carrito, total,
        abonos: pagoUSD > 0 || modo === 'apartado' ? [primerAbono] : [],
        abono: pagoUSD, saldo,
        cliente: clienteSel, estado,
      };
      const { data: creada, error } = await db<Venta>({ table: 'ventas', action: 'insert', values: reg, returning: true, single: true });
      if (error) { alert('Error al registrar:\n' + error.message); return; }
      for (const c of carrito) {
        const it = inventario.find((x) => x.sku === c.sku);
        if (it) await db({ table: 'inventario', action: 'update', values: { stock: it.stock - c.cantidad }, filters: [{ type: 'eq', column: 'sku', value: c.sku }] });
      }
      setCarrito([]); setPagado(''); setBs(''); setClienteSel(null); setQCliente('');
      await Promise.all([recargarInv(), recargarVen()]);
      const num = creada ? ' ' + numeroNota(creada.id) : '';
      if (creada && confirm(`${modo === 'venta' ? 'Venta' : 'Apartado'}${num} registrado ✓\nTotal ${money(total)} · Pagado ${money(pagoUSD)}` + (saldo > 0 ? `\nSaldo pendiente ${money(saldo)}` : '') + '\n\n¿Imprimir nota de entrega?')) {
        imprimirNotaEntrega(creada);
      }
    } finally {
      setGuardando(false);
    }
  }

  async function nuevaClientaRapida() {
    const n = prompt('Nombre de la nueva clienta:');
    if (!n?.trim()) return;
    const { data, error } = await db<{ id: number; nombre: string }>({ table: 'clientas', action: 'insert', values: { nombre: n.trim(), telefono: '', nota: '' }, returning: true, single: true });
    if (error || !data) { alert('Error:\n' + (error?.message || '')); return; }
    await recargarCli();
    setClienteSel({ id: data.id, nombre: data.nombre });
    setQCliente(data.nombre);
    setMostrarClientes(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-5">
            {/* Segmented Venta / Apartado */}
            <div className="mb-4 flex rounded-lg border bg-secondary p-1">
              {(['venta', 'apartado'] as const).map((m) => (
                <button key={m} onClick={() => setModo(m)}
                  className={cn('flex-1 rounded-md py-1.5 text-[13.5px] font-medium capitalize transition-colors',
                    modo === m ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground')}>
                  {m}
                </button>
              ))}
            </div>
            <Label>Buscar zapato (modelo, color, talla o SKU)</Label>
            <Input placeholder="Ej: Vivan, rojo, talla 8…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {resultados.length > 0 && (
              <div className="mt-2 max-h-72 space-y-1.5 overflow-auto">
                {resultados.map((i) => {
                  const sin = i.stock <= 0;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Thumb src={fotosMap[modeloKey(i)]} size={40} />
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium">{i.marca} {i.modelo} T{i.talla}</div>
                          <div className={cn('text-[12px]', sin ? 'text-red-600' : 'text-muted-foreground')}>
                            {i.color} · {money(i.precio)} · {sin ? 'AGOTADO' : `stock ${i.stock}`}
                          </div>
                        </div>
                      </div>
                      <Button size="icon" variant={sin ? 'secondary' : 'default'} disabled={sin} onClick={() => agregar(i)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {q && !resultados.length && <p className="mt-3 text-center text-[13px] text-muted-foreground">No encontrado</p>}
            <Button variant="secondary" className="mt-3 w-full" onClick={() => setScanAbierto(true)}>
              <Camera className="h-4 w-4" /> Escanear código de barras
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="self-start">
        <CardHeader><CardTitle>Carrito</CardTitle></CardHeader>
        <CardContent>
          {carrito.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Carrito vacío</p>
          ) : (
            <div className="space-y-1.5">
              {carrito.map((c) => (
                <div key={c.sku} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Thumb src={(() => { const it = inventario.find((x) => x.sku === c.sku); return it ? fotosMap[modeloKey(it)] : undefined; })()} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium">{c.nombre}</div>
                      <div className="text-[12px] text-muted-foreground tabular">{money(c.precio)} × {c.cantidad} = {money(c.precio * c.cantidad)}</div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setCarrito((p) => p.filter((x) => x.sku !== c.sku))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Label>Clienta (opcional)</Label>
          <div className="flex gap-2">
            <Input placeholder="— Sin clienta — (toca para buscar)" value={qCliente} autoComplete="off"
              onChange={(e) => { setQCliente(e.target.value); setMostrarClientes(true); }}
              onFocus={() => setMostrarClientes(true)} />
            <Button variant="soft" onClick={nuevaClientaRapida}><Plus className="h-4 w-4" /> Nueva</Button>
          </div>
          {mostrarClientes && (
            <div className="mt-2 max-h-48 space-y-1 overflow-auto">
              <button className="w-full rounded-md border px-3 py-2 text-left text-[13px] text-muted-foreground hover:bg-secondary"
                onClick={() => { setClienteSel(null); setQCliente(''); setMostrarClientes(false); }}>
                — Sin clienta —
              </button>
              {resultadosCliente.map((c) => (
                <button key={c.id} className="w-full rounded-md border px-3 py-2 text-left hover:bg-secondary"
                  onClick={() => { setClienteSel({ id: c.id, nombre: c.nombre }); setQCliente(c.nombre); setMostrarClientes(false); }}>
                  <div className="text-[13.5px] font-medium">{c.nombre}</div>
                  <div className="text-[11.5px] text-muted-foreground">{c.cedula ? 'CI ' + c.cedula : ''}{c.cedula && c.telefono ? ' · ' : ''}{c.telefono || ''}</div>
                </button>
              ))}
            </div>
          )}

          {/* ===== Pago ===== */}
          <Label>Método de pago</Label>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)}
            className="flex h-9 w-full appearance-none rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {METODOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {monedaPago === 'BS' ? (
            <div className="grid grid-cols-2 gap-x-3">
              <div>
                <Label>{modo === 'apartado' ? 'Abono' : 'Monto pagado'} (Bs)</Label>
                <Input type="number" inputMode="decimal" placeholder="0" value={bs} onChange={(e) => setBs(e.target.value)} />
              </div>
              <div>
                <Label>Tasa Bs/$</Label>
                <Input type="number" inputMode="decimal" placeholder="0" value={tasa} onChange={(e) => setTasa(e.target.value)} />
              </div>
              <div className="col-span-2 mt-1 text-[12px] text-muted-foreground tabular">Equivale a {money(pagoUSD)}</div>
            </div>
          ) : (
            <>
              <Label>{modo === 'apartado' ? 'Abono inicial' : 'Monto pagado'} (USD)</Label>
              <Input type="number" inputMode="decimal" placeholder={modo === 'venta' ? String(total) : '0'} value={pagado} onChange={(e) => setPagado(e.target.value)} />
            </>
          )}

          <div className="mt-4 flex items-center justify-between border-t-2 border-navy pt-3">
            <div>
              <div className="text-[12px] text-muted-foreground">Total</div>
              <div className={cn('text-[11.5px] tabular', quedaDebiendo ? 'font-semibold text-red-600' : 'text-muted-foreground')}>
                Pagado {money(pagoUSD)}{quedaDebiendo ? ` · Queda debiendo ${money(saldo)}` : carrito.length ? ' · Pago completo' : ''}
              </div>
            </div>
            <div className="text-2xl font-bold tabular">{money(total)}</div>
          </div>
          <Button className="mt-3 w-full" size="lg" onClick={confirmar} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Confirmar'}
          </Button>
        </CardContent>
      </Card>

      <ScannerDialog open={scanAbierto} onClose={() => setScanAbierto(false)} onScan={onScan} />
    </div>
  );
}

function ScannerDialog({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (t: string) => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return;
    const sc = new Html5Qrcode('gatica-reader');
    scannerRef.current = sc;
    const box = (w: number, h: number) => { const m = Math.min(w, h); return { width: Math.floor(m * 0.92), height: Math.floor(m * 0.5) }; };
    sc.start(
      { facingMode: 'environment' },
      {
        fps: 15, qrbox: box, aspectRatio: 1.4,
        videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] },
        // @ts-expect-error opción experimental soportada por la librería
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
      },
      (txt) => onScanRef.current(txt),
      () => {}
    ).catch((e) => {
      alert('No se pudo abrir la cámara.\nDa permiso a la cámara; si la app instalada no abre, prueba desde Safari/Chrome.\n\n' + e);
      onClose();
    });
    return () => { sc.stop().then(() => sc.clear()).catch(() => {}); scannerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title="Escanear código de barras" description="Apunta la cámara a la etiqueta del zapato" />
      <DialogBody>
        <div id="gatica-reader" className="overflow-hidden rounded-lg" />
      </DialogBody>
    </Dialog>
  );
}
