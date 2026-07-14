import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { InvItem, InvRow, Venta, Abono } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ===== Normalización y SKU (misma lógica probada de la app original) ===== */
const CAT_MARCAS: Record<string, string> = { 'steve madden': 'STV', aldo: 'ALD', zara: 'ZAR', 'nine west': 'NWS', 'marca propia': 'GAT', generico: 'GAT', liliana: 'LIL' };
const CAT_COLORES: Record<string, string> = { negro: 'NEG', blanco: 'BLA', beige: 'BEI', camel: 'CAM', dorado: 'DOR', plateado: 'PLA', rojo: 'ROJ', vino: 'VIN', borgona: 'VIN', nude: 'NUD', marron: 'MAR' };

export const norm = (s: unknown) => (s ?? '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const soloLetras = (s: unknown) => norm(s).replace(/[^a-z0-9]/g, '').toUpperCase();
export const codMarca = (n: string, m?: string) => (m && m.trim() ? m.trim().toUpperCase() : CAT_MARCAS[norm(n)] || soloLetras(n).slice(0, 3));
export const codColor = (n: string, m?: string) => (m && m.trim() ? m.trim().toUpperCase() : CAT_COLORES[norm(n)] || soloLetras(n).slice(0, 3));
export const autoModelo = (n: string) => {
  const w = norm(n).split(/\s+/).map((x) => x.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  if (!w.length) return 'MOD';
  if (w.length === 1) return w[0].slice(0, 4).toUpperCase();
  return (w[0].slice(0, 3) + w[w.length - 1].slice(0, 2)).toUpperCase();
};
export const codModelo = (n: string, o?: string) => (o && o.trim() ? o.trim().toUpperCase() : autoModelo(n));
export const tallaCod = (t: unknown) => (t ?? '').toString().trim().toUpperCase().replace('.', '');
export const generarSku = (ma: string, mc: string, mo: string, moc: string, co: string, cc: string, ta: string) =>
  [codMarca(ma, mc), codModelo(mo, moc), codColor(co, cc), tallaCod(ta)].join('-');

export const modeloKey = (i: Pick<InvItem, 'marca' | 'modelo' | 'color'>) => norm(i.marca) + '|' + norm(i.modelo) + '|' + norm(i.color);

/* ===== Fechas en America/Caracas ===== */
const TZ = 'America/Caracas';
export function ahoraISO(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}-04:00`;
}
export const hoyVz = () => ahoraISO().slice(0, 10);
export const mesVz = () => ahoraISO().slice(0, 7);
export const fmtFecha = (f?: string | null) => (f ? new Date(f).toLocaleDateString('es-VE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const fmtHora = (f?: string | null) => (f ? new Date(f).toLocaleTimeString('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '');
export const fmtFechaHora = (f?: string | null) => (f ? new Date(f).toLocaleString('es-VE', { timeZone: TZ }) : '');

/* ===== Abonos (compatibilidad con datos viejos) ===== */
export function getAbonos(v: Venta): Abono[] {
  if (Array.isArray(v.abonos) && v.abonos.length) return v.abonos;
  if (v.estado === 'cancelado') return [];
  if (v.estado === 'pagado') return [{ fecha: v.fecha, monto: v.total || 0 }];
  return [{ fecha: v.fecha, monto: v.abono || 0 }];
}
export const sumAbonos = (v: Venta) => getAbonos(v).reduce((a, x) => a + (+x.monto || 0), 0);

/* ===== Inventario: mapeo fila ↔ objeto ===== */
export const mapInv = (r: InvRow): InvItem => ({
  id: r.id!, sku: r.sku, marca: r.marca, marcaCod: r.marca_cod, modelo: r.modelo, modeloCod: r.modelo_cod,
  color: r.color, colorCod: r.color_cod, talla: r.talla, nombre: r.nombre, costo: r.costo,
  precio: +r.precio || 0, stock: +r.stock || 0, stockMin: +r.stock_min || 0,
});
export const invToRow = (i: Omit<InvItem, 'id'>): InvRow => ({
  sku: i.sku, marca: i.marca, marca_cod: i.marcaCod, modelo: i.modelo, modelo_cod: i.modeloCod,
  color: i.color, color_cod: i.colorCod, talla: i.talla, nombre: i.nombre, costo: i.costo,
  precio: i.precio, stock: i.stock, stock_min: i.stockMin, foto: '',
});

export function estadoStock(i: InvItem): { label: string; tone: 'ok' | 'low' | 'out' } {
  if (i.stock <= 0) return { label: 'Agotado', tone: 'out' };
  if (i.stock <= i.stockMin) return { label: 'Stock bajo', tone: 'low' };
  return { label: 'Disponible', tone: 'ok' };
}

/* ===== Compresión de fotos (una por modelo) ===== */
export function comprimirImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const c = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = (h * max) / w; w = max; } else if (h > max) { w = (w * max) / h; h = max; }
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.62));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
export const TALLAS_CORRIDA = ['5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
