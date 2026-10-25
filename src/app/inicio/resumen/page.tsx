import { getClients, getLoanPlans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { ResumenClientPage } from '@/components/resumen-client-page';
import type { PromotoraSettlement, WeeklyClosure } from '@/lib/types';

export const metadata = {
  title: 'Resumen Operativo | CrediControl',
  description: 'Auditoría y verificación consolidada de colocación, cobranza y fallas por grupo y plaza.',
};

export default async function ResumenPage() {
  const [clients, loanPlans, plazas, localidades, promotoras, appConfig, settlementsSnap, closuresSnap] = await Promise.all([
    getClients(),
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras(),
    getAppConfig(),
    getDocs(collection(db, 'promotoraSettlements')).catch(() => null),
    getDocs(collection(db, 'weeklyClosures')).catch(() => null),
  ]);

  const settlements: PromotoraSettlement[] = settlementsSnap
    ? settlementsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PromotoraSettlement))
    : [];

  const closures: WeeklyClosure[] = closuresSnap
    ? closuresSnap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyClosure))
    : [];

  return (
    <ResumenClientPage
      initialClients={clients}
      initialLoanPlans={loanPlans}
      initialPlazas={plazas}
      initialLocalidades={localidades}
      initialPromotoras={promotoras}
      initialConfig={appConfig}
      initialSettlements={settlements}
      initialClosures={closures}
    />
  );
}
