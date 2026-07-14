import type { InvItem } from './types';

// Impresión de etiquetas para Zebra LP 2824 Plus. El código de barras codifica
// el ID interno (6 dígitos) — nunca el precio. Se abre una ventana con @page
// del tamaño de la etiqueta y JsBarcode se carga por CDN dentro de ella.
const JSBARCODE_CDN = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';

export function imprimirEtiquetaIndividual(i: InvItem) {
  const w = window.open('', '', 'width=400,height=300');
  if (!w) return;
  w.document.write(`<html><head><title>Etiqueta</title><style>@page{size:30mm 25mm;margin:0}*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{width:30mm;height:25mm;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.8mm}svg{max-width:100%;height:auto;max-height:15mm}.t{font-size:14pt;font-weight:bold;margin-top:.8mm}</style></head><body>
    <svg id="b"></svg><div class="t">Talla ${i.talla}</div>
    <script src="${JSBARCODE_CDN}"><\/script>
    <script>JsBarcode('#b','${String(i.id).padStart(6, '0')}',{format:'CODE128',height:50,width:3,margin:10,displayValue:false});setTimeout(()=>{window.print();window.close()},400);<\/script></body></html>`);
  w.document.close();
}

export interface OpcionesLote {
  w: number;
  h: number;
  modo: 'sku' | 'stock' | 'fijo';
  fijo: number;
}

export function imprimirEtiquetasLote(items: InvItem[], op: OpcionesLote) {
  const labels: { code: string; l2: string }[] = [];
  items.forEach((i) => {
    let n = 1;
    if (op.modo === 'stock') n = Math.max(1, i.stock);
    else if (op.modo === 'fijo') n = Math.max(1, op.fijo);
    for (let k = 0; k < n; k++) labels.push({ code: String(i.id).padStart(6, '0'), l2: 'Talla ' + i.talla });
  });
  const bh = Math.max(28, Math.round(op.h * 1.7));
  const win = window.open('', '', 'width=420,height=640');
  if (!win) return;
  win.document.write(
    '<html><head><title>Etiquetas Gatica</title><style>' +
      `@page{size:${op.w}mm ${op.h}mm;margin:0}` +
      '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}' +
      `.label{width:${op.w}mm;height:${op.h}mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1mm;overflow:hidden}` +
      '.l2{font-size:14pt;font-weight:bold;margin-top:.8mm;line-height:1}' +
      `svg{max-width:100%;height:auto;max-height:${Math.round(op.h * 0.62)}mm}` +
      '</style></head><body>' +
      labels.map((lb, idx) => `<div class="label"><svg id="bc${idx}"></svg><div class="l2">${lb.l2}</div></div>`).join('') +
      `<script src="${JSBARCODE_CDN}"><\/script>` +
      `<script>var D=${JSON.stringify(labels)};D.forEach(function(lb,idx){try{JsBarcode("#bc"+idx,lb.code,{format:"CODE128",displayValue:false,height:${bh},width:3,margin:10})}catch(e){}});setTimeout(function(){window.print()},700);<\/script>` +
      '</body></html>'
  );
  win.document.close();
}
