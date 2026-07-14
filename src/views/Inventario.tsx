import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { ChevronDown, ChevronUp, Download, FileUp, Pencil, Plus, Printer, Tag, Trash2 } from 'lucide-react';
import { useStore } from '@/store';
import { db, esDup } from '@/lib/api';
import { TALLAS_CORRIDA, cn, codColor, codMarca, codModelo, coincide, comprimirImagen, estadoStock, generarSku, invToRow, modeloKey, money, norm } from '@/lib/utils';
import { exportarInventario, leerExcel } from '@/lib/excel';
import { imprimirEtiquetaIndividual, imprimirEtiquetasLote } from '@/lib/print';
import type { InvItem } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Thumb } from '@/components/Thumb';

interface Grupo { key: string; marca: string; modelo: string; color: string; foto: string; items: InvItem[]; pares: number }

async function setFotoModelo(mk: string, foto: string) {
  if (!mk || !foto) return;
  await db({ table: 'fotos', action: 'upsert', values: { modelo_key: mk, foto } });
}

export function Inventario() {
  const { inventario, fotosMap, esCeo, recargarInv, recargarFotos } = useStore();
  const [q, setQ] = useState('');
  const [fColor, setFColor] = useState('');
  const [fModelo, setFModelo] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [dlgItem, setDlgItem] = useState<{ editar?: InvItem; prefill?: Partial<InvItem> } | null>(null);
  const [dlgGrupo, setDlgGrupo] = useState<Grupo | null>(null);
  const [dlgImport, setDlgImport] = useState(false);
  const [dlgPrint, setDlgPrint] = useState(false);
  const [dlgBarcode, setDlgBarcode] = useState<InvItem | null>(null);

  const filtrados = useMemo(() => {
    const nq = norm(q);
    return inventario.filter((i) => {
      if (nq && !coincide(i, q)) return false;
      if (fColor && norm(i.color) !== fColor) return false;
      if (fModelo && norm(i.modelo) !== fModelo) return false;
      if (soloBajo && i.stock > i.stockMin) return false;
      return true;
    });
  }, [inventario, q, fColor, fModelo, soloBajo]);

  const grupos: Grupo[] = useMemo(() => {
    const map = new Map<string, Grupo>();
    filtrados.forEach((i) => {
      const k = modeloKey(i);
      if (!map.has(k)) map.set(k, { key: k, marca: i.marca, modelo: i.modelo, color: i.color, foto: fotosMap[k] || '', items: [], pares: 0 });
      map.get(k)!.items.push(i);
    });
    const gs = [...map.values()];
    gs.forEach((g) => {
      g.pares = g.items.reduce((a, i) => a + (+i.stock || 0), 0);
      g.items.sort((a, b) => (parseFloat(a.talla) || 0) - (parseFloat(b.talla) || 0) || String(a.talla).localeCompare(String(b.talla)));
    });
    return gs;
  }, [filtrados, fotosMap]);

  const opciones = (campo: 'color' | 'modelo') => {
    const m = new Map<string, string>();
    inventario.forEach((i) => { const v = (i[campo] || '').trim(); if (v && !m.has(norm(v))) m.set(norm(v), v); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  };

  const totalU = inventario.reduce((a, i) => a + (+i.stock || 0), 0);
  const agot = inventario.filter((i) => i.stock <= 0).length;
  const totalMod = new Set(inventario.map(modeloKey)).size;

  async function eliminarItem(i: InvItem) {
    if (!confirm(`¿Eliminar este zapato?\n${i.marca} ${i.modelo} T${i.talla}`)) return;
    const { error } = await db({ table: 'inventario', action: 'delete', filters: [{ type: 'eq', column: 'id', value: i.id }] });
    if (error) { alert('Error:\n' + error.message); return; }
    await recargarInv();
  }

  // Nota: las fotos SIEMPRE se guardan optimizadas al registrar el producto
  // (comprimidas a 480px y una sola por modelo en la tabla `fotos`), así que
  // ya no existe el proceso manual de "optimizar fotos".
  const toggleSel = (id: number) => setSeleccion((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      {esCeo && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-5">
            <Button onClick={() => setDlgItem({})}><Plus className="h-4 w-4" /> Agregar zapato</Button>
            <Button variant="secondary" onClick={() => setDlgImport(true)}><FileUp className="h-4 w-4" /> Importar Excel</Button>
            <Button variant="secondary" onClick={() => exportarInventario(inventario)}><Download className="h-4 w-4" /> Exportar Excel</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Buscar por modelo, color, talla, SKU…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:col-span-3" />
            <Select value={fColor} onChange={(e) => setFColor(e.target.value)}>
              <option value="">Todos los colores</option>
              {opciones('color').map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </Select>
            <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)}>
              <option value="">Todos los modelos</option>
              {opciones('modelo').map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} className="h-4 w-4 rounded border-input accent-black" />
              Solo stock bajo / agotado
            </label>
          </div>

          <p className="mt-3 text-[12.5px] text-muted-foreground">
            {totalMod} modelos · {inventario.length} variantes · {totalU} pares · {agot} agotados
          </p>

          {esCeo && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="xs" variant="soft" onClick={() => setSeleccion(new Set(filtrados.map((i) => i.id)))}>Seleccionar todos</Button>
              <Button size="xs" variant="soft" onClick={() => setSeleccion(new Set())}>Quitar selección</Button>
              {seleccion.size > 0 && <span className="text-[12px] text-muted-foreground">{seleccion.size} seleccionados</span>}
              <Button size="sm" className="ml-auto" onClick={() => (seleccion.size ? setDlgPrint(true) : alert('Primero marca al menos un zapato (la casilla a la izquierda). Tip: filtra por modelo y usa "Seleccionar todos".'))}>
                <Printer className="h-4 w-4" /> Imprimir etiquetas
              </Button>
            </div>
          )}

          <div className="mt-3 divide-y">
            {!grupos.length && <p className="py-8 text-center text-[13px] text-muted-foreground">Sin resultados</p>}
            {grupos.map((g) => {
              const abierto = expandidos.has(g.key);
              const bajo = g.items.some((i) => i.stock > 0 && i.stock <= i.stockMin);
              const badge = g.pares <= 0 ? { t: 'Agotado', v: 'out' as const } : bajo ? { t: 'Stock bajo', v: 'low' as const } : { t: 'Disponible', v: 'ok' as const };
              const selTodas = g.items.length > 0 && g.items.every((i) => seleccion.has(i.id));
              return (
                <div key={g.key}>
                  <div className="flex cursor-pointer items-start gap-3 py-3"
                    onClick={() => setExpandidos((p) => { const n = new Set(p); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>
                    <Thumb src={g.foto} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">{g.marca} {g.modelo}{g.color ? ' · ' + g.color : ''}</div>
                      <div className="text-[12.5px] text-muted-foreground">{g.items.length} talla(s) · Total: {g.pares} par(es) en stock</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant={badge.v}>{badge.t}</Badge>
                        {esCeo && (
                          <Button size="xs" variant="soft" onClick={(e) => { e.stopPropagation(); setDlgGrupo(g); }}>
                            <Pencil className="h-3 w-3" /> Editar grupo
                          </Button>
                        )}
                        <span className="ml-auto flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
                          {abierto ? <>ocultar <ChevronUp className="h-3.5 w-3.5" /></> : <>ver tallas <ChevronDown className="h-3.5 w-3.5" /></>}
                        </span>
                      </div>
                    </div>
                  </div>
                  {abierto && (
                    <div className="mb-3 rounded-lg border bg-secondary/50 px-3 py-1.5">
                      {g.items.map((i) => {
                        const e = estadoStock(i);
                        return (
                          <div key={i.id} className="flex items-center gap-2.5 border-b border-dashed py-2 last:border-0">
                            {esCeo && <input type="checkbox" checked={seleccion.has(i.id)} onChange={() => toggleSel(i.id)} className="h-4 w-4 flex-none rounded accent-black" />}
                            <div className="min-w-0 flex-1">
                              <span className="text-[13.5px] font-semibold">Talla {i.talla}</span>
                              <span className="text-[13px] text-muted-foreground"> · Stock {i.stock} · {money(i.precio)} </span>
                              <Badge variant={e.tone}>{e.label}</Badge>
                              <div className="font-mono text-[11px] text-primary/80">{i.sku}</div>
                            </div>
                            <div className="flex flex-none gap-1">
                              {esCeo && <Button size="icon" variant="soft" onClick={() => setDlgItem({ editar: i })}><Pencil className="h-3.5 w-3.5" /></Button>}
                              <Button size="icon" variant="soft" onClick={() => setDlgBarcode(i)}><Tag className="h-3.5 w-3.5" /></Button>
                              {esCeo && <Button size="icon" variant="destructive" onClick={() => eliminarItem(i)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                            </div>
                          </div>
                        );
                      })}
                      {esCeo && (
                        <div className="flex flex-wrap gap-2 py-2">
                          <Button size="xs" onClick={() => setDlgItem({ prefill: { ...g.items[0], talla: '', stock: 1 } })}><Plus className="h-3 w-3" /> Agregar talla</Button>
                          <Button size="xs" variant="soft"
                            onClick={() => setSeleccion((p) => { const n = new Set(p); g.items.forEach((i) => (selTodas ? n.delete(i.id) : n.add(i.id))); return n; })}>
                            {selTodas ? '☑ Quitar selección' : 'Seleccionar todas para imprimir'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {dlgItem && <ItemDialog cfg={dlgItem} onClose={() => setDlgItem(null)} />}
      {dlgGrupo && <GrupoDialog grupo={dlgGrupo} onClose={() => setDlgGrupo(null)} />}
      <ImportDialog open={dlgImport} onClose={() => setDlgImport(false)} />
      <PrintDialog open={dlgPrint} onClose={() => setDlgPrint(false)} items={inventario.filter((i) => seleccion.has(i.id))} />
      {dlgBarcode && <BarcodeDialog item={dlgBarcode} onClose={() => setDlgBarcode(null)} />}
    </div>
  );
}

/* ===== Diálogo agregar / editar zapato (incluye corrida y agregar-talla) ===== */
function ItemDialog({ cfg, onClose }: { cfg: { editar?: InvItem; prefill?: Partial<InvItem> }; onClose: () => void }) {
  const { inventario, fotosMap, esCeo, recargarInv, recargarFotos } = useStore();
  const base = cfg.editar ?? cfg.prefill;
  const [marca, setMarca] = useState(base?.marca ?? '');
  const [marcaCod, setMarcaCod] = useState(base?.marcaCod ?? '');
  const [modelo, setModelo] = useState(base?.modelo ?? '');
  const [modeloCod, setModeloCod] = useState(base?.modeloCod ?? '');
  const [nombre, setNombre] = useState(base?.nombre ?? '');
  const [color, setColor] = useState(base?.color ?? '');
  const [colorCod, setColorCod] = useState(base?.colorCod ?? '');
  const [modoTalla, setModoTalla] = useState<'single' | 'corrida'>('single');
  const [talla, setTalla] = useState(base?.talla ?? '');
  const [tallasSel, setTallasSel] = useState<Set<string>>(new Set());
  const [costo, setCosto] = useState(base?.costo != null ? String(base.costo) : '');
  const [precio, setPrecio] = useState(base?.precio != null ? String(base.precio) : '');
  const [stock, setStock] = useState(base?.stock != null ? String(base.stock) : '');
  const [stockMin, setStockMin] = useState(base?.stockMin != null ? String(base.stockMin) : '');
  const [foto, setFoto] = useState<string>(base ? fotosMap[modeloKey(base as InvItem)] || '' : '');
  const [guardando, setGuardando] = useState(false);

  const skuPreview = modoTalla === 'corrida'
    ? generarSku(marca, marcaCod, modelo, modeloCod, color, colorCod, '').replace(/-$/, '') + '-[talla]'
    : generarSku(marca, marcaCod, modelo, modeloCod, color, colorCod, talla).replace(/--+/g, '-').replace(/^-|-$/g, '') || '—';

  async function guardar() {
    if (!marca || !modelo) { alert('Falta marca o modelo.'); return; }
    setGuardando(true);
    try {
      const mk = norm(marca) + '|' + norm(modelo) + '|' + norm(color);
      if (!cfg.editar && modoTalla === 'corrida') {
        if (!tallasSel.size) { alert('Selecciona al menos una talla.'); return; }
        const nuevos: ReturnType<typeof invToRow>[] = [];
        let skip = 0;
        [...tallasSel].sort().forEach((t) => {
          const sku = generarSku(marca, marcaCod, modelo, modeloCod, color, colorCod, t);
          if (inventario.some((i) => i.sku === sku)) { skip++; return; }
          nuevos.push(invToRow({ sku, marca, marcaCod: codMarca(marca, marcaCod), modelo, modeloCod: codModelo(modelo, modeloCod), color, colorCod: codColor(color, colorCod), talla: t, nombre, costo: +costo || 0, precio: +precio || 0, stock: +stock || 1, stockMin: +stockMin || 0 }));
        });
        if (!nuevos.length) { alert('Todas esas tallas ya existen.'); return; }
        const { error } = await db({ table: 'inventario', action: 'insert', values: nuevos });
        if (error) { alert('Error al crear la corrida:\n' + error.message); return; }
        if (foto) await setFotoModelo(mk, foto);
        alert(`Corrida creada ✓\nTallas agregadas: ${nuevos.length}${skip ? '\nOmitidas (ya existían): ' + skip : ''}`);
      } else {
        if (!talla) { alert('Falta la talla.'); return; }
        const sku = generarSku(marca, marcaCod, modelo, modeloCod, color, colorCod, talla);
        const obj = invToRow({ sku, marca, marcaCod: codMarca(marca, marcaCod), modelo, modeloCod: codModelo(modelo, modeloCod), color, colorCod: codColor(color, colorCod), talla, nombre, costo: +costo || 0, precio: +precio || 0, stock: +stock || 0, stockMin: +stockMin || 0 });
        if (!cfg.editar) {
          if (inventario.some((i) => i.sku === sku)) { alert('Ya existe ese SKU:\n' + sku + '\nEdita el zapato existente.'); return; }
          const { error } = await db({ table: 'inventario', action: 'insert', values: obj });
          if (error) { alert(esDup(error) ? 'Ya existe ese SKU:\n' + sku : 'Error:\n' + error.message); return; }
        } else {
          if (inventario.some((i) => i.sku === sku && i.id !== cfg.editar!.id)) { alert('Otro zapato ya tiene ese SKU:\n' + sku); return; }
          const { error } = await db({ table: 'inventario', action: 'update', values: obj, filters: [{ type: 'eq', column: 'id', value: cfg.editar.id }] });
          if (error) { alert('Error al editar:\n' + error.message); return; }
        }
        if (foto) await setFotoModelo(mk, foto);
      }
      await Promise.all([recargarInv(), recargarFotos()]);
      onClose();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} className="max-w-lg">
      <DialogHeader title={cfg.editar ? 'Editar zapato' : cfg.prefill ? `Agregar talla · ${cfg.prefill.marca} ${cfg.prefill.modelo}` : 'Agregar zapato'} />
      <DialogBody>
        <div className="grid grid-cols-2 gap-x-3">
          <div><Label>Marca</Label><Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Liliana" /></div>
          <div><Label>Cód. marca (3)</Label><Input maxLength={3} value={marcaCod} onChange={(e) => setMarcaCod(e.target.value)} placeholder="auto" /></div>
          <div><Label>Modelo</Label><Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Vivan-1" /></div>
          <div><Label>Cód. modelo</Label><Input maxLength={6} value={modeloCod} onChange={(e) => setModeloCod(e.target.value)} placeholder="auto" /></div>
        </div>
        <Label>Nombre interno</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="gamuza marrón" />
        <div className="grid grid-cols-2 gap-x-3">
          <div><Label>Color</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Marrón" /></div>
          <div><Label>Cód. color (3)</Label><Input maxLength={3} value={colorCod} onChange={(e) => setColorCod(e.target.value)} placeholder="auto" /></div>
        </div>

        {!cfg.editar && (
          <div className="mt-3 flex rounded-lg border bg-secondary p-1">
            {(['single', 'corrida'] as const).map((m) => (
              <button key={m} onClick={() => setModoTalla(m)}
                className={cn('flex-1 rounded-md py-1.5 text-[13px] font-medium', modoTalla === m ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground')}>
                {m === 'single' ? 'Una talla' : 'Corrida (varias)'}
              </button>
            ))}
          </div>
        )}

        {modoTalla === 'single' || cfg.editar ? (
          <><Label>Talla</Label><Input value={talla} onChange={(e) => setTalla(e.target.value)} placeholder="8" /></>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label>Tallas disponibles</Label>
              <Button size="xs" variant="soft" onClick={() => setTallasSel(new Set(TALLAS_CORRIDA))}>Todas</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TALLAS_CORRIDA.map((t) => (
                <button key={t}
                  onClick={() => setTallasSel((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                  className={cn('min-w-[46px] rounded-md border px-2.5 py-1.5 text-[13px] font-semibold',
                    tallasSel.has(t) ? 'border-primary bg-primary text-white' : 'bg-white')}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-x-3">
          {esCeo && <div><Label>Costo USD</Label><Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" /></div>}
          <div><Label>Precio venta</Label><Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" /></div>
          <div><Label>Stock {modoTalla === 'corrida' && !cfg.editar ? '(por talla)' : ''}</Label><Input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="1" /></div>
          <div><Label>Stock mínimo</Label><Input type="number" inputMode="numeric" value={stockMin} onChange={(e) => setStockMin(e.target.value)} placeholder="0" /></div>
        </div>

        <Label>Foto del zapato</Label>
        <Input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setFoto(await comprimirImagen(f)); }} />
        {foto && <img src={foto} className="mt-2 h-20 w-20 rounded-md object-cover" />}

        <div className="mt-4 rounded-lg bg-secondary p-3 text-center">
          <div className="text-[11px] text-muted-foreground">SKU</div>
          <div className="font-mono text-[15px] font-medium text-primary">{skuPreview}</div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ===== Diálogo editar grupo (modelo completo) ===== */
function GrupoDialog({ grupo, onClose }: { grupo: Grupo; onClose: () => void }) {
  const { esCeo, recargarInv, recargarFotos } = useStore();
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [stockMin, setStockMin] = useState('');
  const [foto, setFoto] = useState('');

  async function aplicar() {
    const obj: Record<string, number> = {};
    if (precio !== '') obj.precio = +precio || 0;
    if (costo !== '') obj.costo = +costo || 0;
    if (stockMin !== '') obj.stock_min = +stockMin || 0;
    if (!Object.keys(obj).length && !foto) { alert('Cambia al menos un dato (precio, costo, stock mínimo) o la foto.'); return; }
    if (Object.keys(obj).length) {
      const { error } = await db({ table: 'inventario', action: 'update', values: obj, filters: [{ type: 'in', column: 'id', value: grupo.items.map((i) => i.id) }] });
      if (error) { alert('Error al editar el grupo:\n' + error.message); return; }
    }
    if (foto) await setFotoModelo(grupo.key, foto);
    await Promise.all([recargarInv(), recargarFotos()]);
    onClose();
    alert('Modelo actualizado ✓');
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title="Editar grupo" description={`${grupo.marca} ${grupo.modelo}${grupo.color ? ' · ' + grupo.color : ''} — ${grupo.items.length} talla(s) · ${grupo.pares} par(es). Lo que escribas se aplica a TODAS las tallas.`} />
      <DialogBody>
        <Label>Nuevo precio de venta</Label>
        <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Dejar vacío = no cambiar" />
        {esCeo && (<><Label>Nuevo costo USD (opcional)</Label>
          <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Dejar vacío = no cambiar" /></>)}
        <Label>Nuevo stock mínimo (opcional)</Label>
        <Input type="number" inputMode="numeric" value={stockMin} onChange={(e) => setStockMin(e.target.value)} placeholder="Dejar vacío = no cambiar" />
        <Label>Foto del modelo (opcional)</Label>
        <Input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setFoto(await comprimirImagen(f)); }} />
        {(foto || grupo.foto) && <img src={foto || grupo.foto} className="mt-2 max-w-[130px] rounded-md" />}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={aplicar}>Aplicar a todo el modelo</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ===== Importar Excel ===== */
function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { inventario, recargarInv } = useStore();
  const [procesando, setProcesando] = useState(false);

  async function importar(file: File) {
    setProcesando(true);
    try {
      const filas = await leerExcel(file);
      const nuevos: ReturnType<typeof invToRow>[] = [];
      let skip = 0;
      const vistos = new Set(inventario.map((i) => i.sku));
      filas.forEach((r) => {
        if (!r.marca || !r.modelo || !r.talla) { skip++; return; }
        const sku = generarSku(r.marca, '', r.modelo, r.modeloCod, r.color, r.colorCod, r.talla);
        if (vistos.has(sku)) { skip++; return; }
        vistos.add(sku);
        nuevos.push(invToRow({ sku, marca: r.marca, marcaCod: codMarca(r.marca, ''), modelo: r.modelo, modeloCod: codModelo(r.modelo, r.modeloCod), color: r.color, colorCod: codColor(r.color, r.colorCod), talla: r.talla, nombre: r.nombre, costo: r.costo, precio: r.precio, stock: r.stock, stockMin: r.stockMin }));
      });
      if (nuevos.length) {
        const { error } = await db({ table: 'inventario', action: 'insert', values: nuevos });
        if (error) { alert('Error:\n' + error.message); return; }
      }
      await recargarInv();
      onClose();
      alert(`Importación lista ✓\nAgregados: ${nuevos.length}\nOmitidos: ${skip}`);
    } catch (err) {
      alert('No se pudo leer el archivo.\n' + err);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title="Importar desde Excel" description="Sube la plantilla. Genera SKU y código de barras solo. (Las fotos se agregan después editando cada modelo.)" />
      <DialogBody>
        <Input type="file" accept=".xlsx,.xls,.csv" disabled={procesando} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); }} />
      </DialogBody>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Cerrar</Button></DialogFooter>
    </Dialog>
  );
}

/* ===== Imprimir etiquetas (lote) ===== */
function PrintDialog({ open, onClose, items }: { open: boolean; onClose: () => void; items: InvItem[] }) {
  const [w, setW] = useState('50');
  const [h, setH] = useState('30');
  const [modo, setModo] = useState<'sku' | 'stock' | 'fijo'>('sku');
  const [fijo, setFijo] = useState('1');

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('gatica_lbl') || 'null');
      if (p) { setW(String(p.w)); setH(String(p.h)); }
    } catch { /* sin preferencias guardadas */ }
  }, [open]);

  function imprimir() {
    const wn = +w || 50, hn = +h || 30;
    try { localStorage.setItem('gatica_lbl', JSON.stringify({ w: wn, h: hn })); } catch { /* almacenamiento no disponible */ }
    imprimirEtiquetasLote(items, { w: wn, h: hn, modo, fijo: Math.max(1, +fijo || 1) });
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title="Imprimir etiquetas" description={`${items.length} zapato(s) seleccionado(s).`} />
      <DialogBody>
        <div className="grid grid-cols-2 gap-x-3">
          <div><Label>Ancho etiqueta (mm)</Label><Input type="number" value={w} onChange={(e) => setW(e.target.value)} /></div>
          <div><Label>Alto etiqueta (mm)</Label><Input type="number" value={h} onChange={(e) => setH(e.target.value)} /></div>
        </div>
        <Label>¿Cuántas etiquetas por zapato?</Label>
        <div className="space-y-1.5 text-[13.5px]">
          {([['sku', 'Una por modelo/talla (SKU)'], ['stock', 'Una por cada par en stock'], ['fijo', 'Cantidad fija:']] as const).map(([v, t]) => (
            <label key={v} className="flex items-center gap-2 font-medium">
              <input type="radio" name="copias" checked={modo === v} onChange={() => setModo(v)} className="accent-black" />
              {t}
              {v === 'fijo' && <Input type="number" value={fijo} onChange={(e) => setFijo(e.target.value)} className="h-7 w-20" />}
            </label>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={imprimir}><Printer className="h-4 w-4" /> Imprimir</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ===== Ver / imprimir código de barras individual ===== */
function BarcodeDialog({ item, onClose }: { item: InvItem; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, String(item.id).padStart(6, '0'), { format: 'CODE128', displayValue: false, height: 60, width: 3, margin: 8 });
    }
  }, [item]);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title={`${item.marca} ${item.modelo} T${item.talla} · ${money(item.precio)}`} />
      <DialogBody className="text-center">
        <svg ref={svgRef} className="mx-auto max-w-full" />
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{item.sku}</div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button variant="soft" onClick={() => imprimirEtiquetaIndividual(item)}><Printer className="h-4 w-4" /> Imprimir etiqueta</Button>
      </DialogFooter>
    </Dialog>
  );
}
