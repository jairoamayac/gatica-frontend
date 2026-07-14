import * as XLSX from 'xlsx';
import type { InvItem, Venta } from './types';
import { fmtFechaHora, hoyVz, sumAbonos } from './utils';

export function exportarInventario(inventario: InvItem[]) {
  const filas = inventario.map((i) => ({
    Marca: i.marca, Cod_Marca: i.marcaCod, Modelo: i.modelo, Nombre: i.nombre,
    Color: i.color, Cod_Color: i.colorCod, Talla: i.talla, SKU: i.sku,
    Costo: i.costo ?? 0, Precio: i.precio, Stock: i.stock, Stock_Min: i.stockMin,
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  XLSX.writeFile(wb, `Gatica_Inventario_${hoyVz()}.xlsx`);
}

export function exportarVentas(ventas: Venta[]) {
  const filas: Record<string, unknown>[] = [];
  ventas.forEach((v) => {
    (v.items || []).forEach((it) => {
      filas.push({
        Fecha: fmtFechaHora(v.fecha), Tipo: v.tipo, Estado: v.estado,
        Clienta: v.cliente?.nombre ?? '', Producto: it.nombre, SKU: it.sku,
        Cantidad: it.cantidad, Precio_Unit: it.precio, Subtotal: it.precio * it.cantidad,
        Total_Venta: v.total, Abonado: sumAbonos(v), Saldo: Math.max(0, (v.total || 0) - sumAbonos(v)),
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
  XLSX.writeFile(wb, `Gatica_Ventas_${hoyVz()}.xlsx`);
}

export interface FilaImportada {
  marca: string; modelo: string; talla: string; color: string;
  colorCod: string; modeloCod: string; nombre: string;
  costo: number; precio: number; stock: number; stockMin: number;
}

export function leerExcel(file: File): Promise<FilaImportada[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const G = (r: Record<string, unknown>, ...ks: string[]) => {
          for (const k of ks) if (r[k] !== undefined && String(r[k]).trim() !== '') return String(r[k]);
          return '';
        };
        resolve(rows.map((r) => ({
          marca: G(r, 'marca', 'Marca', 'MARCA').trim(),
          modelo: G(r, 'modelo', 'Modelo', 'MODELO').trim(),
          talla: G(r, 'talla', 'Talla', 'TALLA').trim(),
          color: G(r, 'color', 'Color', 'COLOR').trim(),
          colorCod: G(r, 'cod_color', 'codcolor', 'COD_COLOR'),
          modeloCod: G(r, 'cod_modelo', 'codmodelo', 'COD_MODELO'),
          nombre: G(r, 'nombre', 'Nombre').trim(),
          costo: +G(r, 'costo', 'Costo') || 0,
          precio: +G(r, 'precio', 'Precio') || 0,
          stock: +G(r, 'stock', 'Stock') || 0,
          stockMin: +G(r, 'stock_min', 'stockmin', 'Stock_Min') || 0,
        })));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
