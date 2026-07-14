export interface InvItem {
  id: number;
  sku: string;
  marca: string;
  marcaCod: string;
  modelo: string;
  modeloCod: string;
  color: string;
  colorCod: string;
  talla: string;
  nombre: string;
  costo?: number; // el backend la omite para el rol vendedora
  precio: number;
  stock: number;
  stockMin: number;
}

export type MetodoPago = 'efectivo_usd' | 'efectivo_bs' | 'pago_movil' | 'punto' | 'zelle' | 'transferencia' | 'otro';

export interface Abono {
  fecha: string;
  monto: number; // siempre en USD (moneda del sistema)
  metodo?: MetodoPago;
  moneda?: 'USD' | 'BS';
  tasa?: number; // Bs por USD, cuando el pago fue en bolívares
  montoBs?: number; // lo que entregó la clienta en Bs
}

export interface VentaItem {
  sku: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface Venta {
  id: number;
  fecha: string;
  tipo: 'venta' | 'apartado';
  estado: 'pagado' | 'activo' | 'cancelado' | string;
  items: VentaItem[] | null;
  cliente: { id: number; nombre: string } | null;
  abonos: Abono[] | null;
  abono?: number;
  saldo?: number;
  total: number;
}

export interface Clienta {
  id: number;
  nombre: string;
  telefono?: string;
  cedula?: string;
  nota?: string;
  // Columna opcional: existe solo si se corrió `alter table clientas add column cumple date;`
  cumple?: string | null;
}

export interface Sesion {
  token: string;
  rol: 'ceo' | 'vendedora';
  nombre: string;
}

// Fila cruda de Supabase (snake_case) para inventario
export interface InvRow {
  id?: number;
  sku: string;
  marca: string;
  marca_cod: string;
  modelo: string;
  modelo_cod: string;
  color: string;
  color_cod: string;
  talla: string;
  nombre: string;
  costo?: number;
  precio: number;
  stock: number;
  stock_min: number;
  foto?: string | null;
}
