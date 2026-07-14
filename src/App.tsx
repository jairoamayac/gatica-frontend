import { useState } from 'react';
import { useStore } from './store';
import { Layout, type Vista } from './components/Layout';
import { Login } from './views/Login';
import { Ventas } from './views/Ventas';
import { Inventario } from './views/Inventario';
import { Clientas } from './views/Clientas';
import { Apartados } from './views/Apartados';
import { Reportes } from './views/Reportes';

export default function App() {
  const { sesion } = useStore();
  const [vista, setVista] = useState<Vista>('ventas');

  if (!sesion) return <Login />;

  return (
    <Layout vista={vista} onVista={setVista}>
      {vista === 'ventas' && <Ventas />}
      {vista === 'inventario' && <Inventario />}
      {vista === 'clientas' && <Clientas />}
      {vista === 'apartados' && <Apartados />}
      {vista === 'reportes' && <Reportes />}
    </Layout>
  );
}
