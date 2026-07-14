import { useState } from 'react';
import { useStore } from '@/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Login() {
  const { login } = useStore();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError('');
    setCargando(true);
    try {
      await login(usuario, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/60 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-lg font-bold text-white">G</div>
          <h1 className="text-xl font-bold">Gatica Boutique</h1>
          <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">Sistema de zapatos</p>
        </div>
        <Card>
          <CardContent className="pt-5">
            <Label htmlFor="lg-user">Usuario</Label>
            <Input id="lg-user" autoComplete="username" placeholder="Tu usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            <Label htmlFor="lg-pass">Contraseña</Label>
            <Input id="lg-pass" type="password" autoComplete="current-password" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()} />
            {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
            <Button className="mt-4 w-full" onClick={entrar} disabled={cargando}>
              {cargando ? 'Entrando…' : 'Entrar'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
