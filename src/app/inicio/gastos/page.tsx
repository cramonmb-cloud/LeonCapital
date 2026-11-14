import { getPlazas, getAppConfig } from '@/lib/firestore-data';
import { GastosClientPage } from '@/components/gastos-client-page';

export const metadata = {
  title: 'Gastos Semanales | CrediControl',
  description: 'Control, registro e importación de gastos operativos por semana sincronizados con Precaptura.',
};

export default async function GastosPage() {
  const [plazas, appConfig] = await Promise.all([
    getPlazas(),
    getAppConfig(),
  ]);

  return (
    <GastosClientPage
      initialPlazas={plazas}
      initialConfig={appConfig}
    />
  );
}
