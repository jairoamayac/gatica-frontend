import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function Thumb({ src, size = 44, className }: { src?: string; size?: number; className?: string }) {
  const [ver, setVer] = useState(false);
  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={cn('flex flex-none items-center justify-center rounded-md bg-accent text-accent-foreground', className)}
      >
        👠
      </div>
    );
  }
  return (
    <>
      <img
        src={src}
        style={{ width: size, height: size }}
        className={cn('flex-none cursor-zoom-in rounded-md object-cover', className)}
        onClick={(e) => { e.stopPropagation(); setVer(true); }}
      />
      <Dialog open={ver} onClose={() => setVer(false)} className="max-w-lg">
        <img src={src} className="block w-full rounded-xl" onClick={() => setVer(false)} />
      </Dialog>
    </>
  );
}
