import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Botón flotante para instalar la app en el dispositivo. En Chrome/Android/Edge
// usa el evento nativo beforeinstallprompt; en iPhone (Safari no lo soporta)
// muestra las instrucciones de "Compartir → Añadir a inicio".
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [iosHelp, setIosHelp] = useState(false);
  const [oculto, setOculto] = useState(() => localStorage.getItem('gatica_no_install') === '1');

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', onBIP);
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  if (standalone || oculto) return null;
  // Solo mostramos si hay evento nativo disponible o es iOS (instalación manual)
  if (!deferred && !esIOS) return null;

  const cerrar = () => { setOculto(true); localStorage.setItem('gatica_no_install', '1'); };

  async function instalar() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      cerrar();
    } else {
      setIosHelp(true);
    }
  }

  return (
    <>
      <div className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-white p-3 shadow-lg md:bottom-4 md:left-64">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">G</div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Instalar Gatica POS</div>
          <div className="text-[11.5px] text-muted-foreground">Ábrela como app, sin barras del navegador</div>
        </div>
        <Button size="sm" onClick={instalar}><Download className="h-4 w-4" /> Instalar</Button>
        <button onClick={cerrar} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>

      {iosHelp && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-navy/40 p-4" onClick={() => setIosHelp(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold">Instalar en iPhone</h3>
            <ol className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li className="flex items-center gap-2">1. Toca <Share className="inline h-4 w-4" /> (Compartir) abajo en Safari</li>
              <li>2. Elige <b className="text-foreground">“Añadir a pantalla de inicio”</b></li>
              <li>3. Toca <b className="text-foreground">Añadir</b> — ya la tienes como app</li>
            </ol>
            <Button className="mt-4 w-full" onClick={() => setIosHelp(false)}>Entendido</Button>
          </div>
        </div>
      )}
    </>
  );
}
