import type { Venta } from './types';
import { fmtFecha, fmtHora, getAbonos, metodoLabel, money, sumAbonos } from './utils';

export const numeroNota = (id: number) => 'Nº ' + String(id).padStart(6, '0');

// Nota de entrega imprimible (media carta). Sirve como comprobante para la
// clienta: número de venta, productos, pagos y saldo. No muestra costos.
export function imprimirNotaEntrega(v: Venta) {
  const pagado = sumAbonos(v);
  const saldo = Math.max(0, (v.total || 0) - pagado);
  const filas = (v.items || [])
    .map((it) => `<tr><td>${it.cantidad}</td><td>${it.nombre}</td><td class="r">${money(it.precio)}</td><td class="r">${money(it.precio * it.cantidad)}</td></tr>`)
    .join('');
  const abonos = getAbonos(v)
    .map((a) => `<tr><td>${fmtFecha(a.fecha)}</td><td>${metodoLabel(a.metodo) || '—'}${a.montoBs ? ` (Bs ${a.montoBs.toLocaleString('es-VE')} a ${a.tasa})` : ''}</td><td class="r">${money(+a.monto || 0)}</td></tr>`)
    .join('');

  const w = window.open('', '', 'width=480,height=640');
  if (!w) return;
  w.document.write(`<html><head><title>Nota de entrega ${numeroNota(v.id)}</title><style>
    @page{size:5.5in 8.5in;margin:10mm}
    *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#111}
    body{padding:4mm;font-size:11pt}
    .head{text-align:center;border-bottom:2px solid #111;padding-bottom:3mm;margin-bottom:3mm}
    .head h1{font-size:16pt;letter-spacing:1px}
    .head small{letter-spacing:3px;font-size:8pt;color:#555}
    .meta{display:flex;justify-content:space-between;font-size:9.5pt;margin-bottom:3mm}
    h2{font-size:10pt;margin:3mm 0 1.5mm;text-transform:uppercase;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}
    th,td{padding:1.2mm 1mm;text-align:left;border-bottom:1px solid #ddd}
    th{border-bottom:1px solid #111;font-size:8.5pt;text-transform:uppercase}
    .r{text-align:right}
    .tot{margin-top:3mm;font-size:10.5pt}
    .tot div{display:flex;justify-content:space-between;padding:.8mm 0}
    .tot .g{font-weight:bold;font-size:12pt;border-top:2px solid #111;padding-top:1.5mm}
    .debe{color:#b3261e;font-weight:bold}
    .pie{margin-top:5mm;text-align:center;font-size:8.5pt;color:#555}
  </style></head><body>
    <div class="head"><h1>Gatica Boutique</h1><small>SISTEMA DE ZAPATOS</small></div>
    <div class="meta">
      <div><b>Nota de entrega ${numeroNota(v.id)}</b><br>${fmtFecha(v.fecha)} ${fmtHora(v.fecha)}</div>
      <div style="text-align:right">Clienta:<br><b>${v.cliente?.nombre || 'Consumidor final'}</b></div>
    </div>
    <table><thead><tr><th>Cant.</th><th>Producto</th><th class="r">Precio</th><th class="r">Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
    ${abonos ? `<h2>Pagos recibidos</h2><table><tbody>${abonos}</tbody></table>` : ''}
    <div class="tot">
      <div class="g"><span>Total</span><span>${money(v.total)}</span></div>
      <div><span>Pagado</span><span>${money(pagado)}</span></div>
      ${saldo > 0 ? `<div class="debe"><span>Saldo pendiente</span><span>${money(saldo)}</span></div>` : '<div><span>Estado</span><span>✔ Pagado completo</span></div>'}
    </div>
    <div class="pie">¡Gracias por tu compra! · Conserva esta nota para cambios y reclamos</div>
    <script>setTimeout(function(){window.print()},300);<\/script>
  </body></html>`);
  w.document.close();
}
