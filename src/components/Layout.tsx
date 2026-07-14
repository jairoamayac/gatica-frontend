import React from 'react';
import { ShoppingBag, Package, Users, BookmarkCheck, BarChart3, LogOut } from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type Vista = 'ventas' | 'inventario' | 'clientas' | 'apartados' | 'reportes';

const NAV: { id: Vista; label: string; icon: React.ElementType }[] = [
  { id: 'ventas', label: 'Ventas', icon: ShoppingBag },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'clientas', label: 'Clientas', icon: Users },
  { id: 'apartados', label: 'Apartados', icon: BookmarkCheck },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
];

export function Layout({ vista, onVista, children }: { vista: Vista; onVista: (v: Vista) => void; children: React.ReactNode }) {
  const { sesion, online, logout } = useStore();
  return (
    <div className="min-h-screen bg-secondary/60">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-[15px] font-bold text-white">G</div>
          <div>
            <div className="text-[14px] font-semibold leading-tight text-navy">Gatica Boutique</div>
            <div className="text-[11px] text-muted-foreground">Sistema de zapatos</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onVista(id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors',
                vista === id ? 'bg-accent text-accent-foreground' : 'text-navy/80 hover:bg-secondary'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{sesion?.nombre}</div>
              <div className="text-[11px] text-muted-foreground">{sesion?.rol === 'ceo' ? 'CEO' : 'Vendedora'}</div>
            </div>
            <button onClick={logout} title="Cerrar sesión" className="rounded-md p-2 text-muted-foreground hover:bg-secondary">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido */}
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2.5 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-navy text-[13px] font-bold text-white">G</div>
            <span className="text-[14px] font-semibold text-navy">Gatica Boutique</span>
          </div>
          <h1 className="hidden text-lg font-bold md:block">{NAV.find((n) => n.id === vista)?.label}</h1>
          <div className="flex items-center gap-2">
            <Badge variant={online ? 'ok' : 'default'}>{online ? '● en la nube' : 'sin conexión'}</Badge>
            <button onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary md:hidden" title="Salir">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-5 md:px-8 md:pb-10">{children}</main>
      </div>

      {/* Nav inferior (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onVista(id)}
            className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', vista === id ? 'text-primary' : 'text-muted-foreground')}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
