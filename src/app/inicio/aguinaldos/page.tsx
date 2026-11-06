import { getLoans, getPromotoras, getLocalidades, getPlazas, getClients, getLoanPlans, getAppConfig } from '@/lib/firestore-data';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { AguinaldosClientPage } from '@/components/aguinaldos-client-page';
import type { PromotoraSettlement, Client } from '@/lib/types';

export const metadata = {
  title: 'Cálculo de Aguinaldos | CrediControl',
  description: 'Cálculo y auditoría de gratificación anual y aguinaldos a promotoras según colocación de crédito.',
};

export default async function AguinaldosPage() {
  const [loans, promotoras, localidades, plazas, clients, loanPlans, appConfig, settlementsSnap] = await Promise.all([
    getLoans().catch(() => []),
    getPromotoras().catch(() => []),
    getLocalidades().catch(() => []),
    getPlazas().catch(() => []),
    getClients().catch(() => []),
    getLoanPlans().catch(() => []),
    getAppConfig().catch(() => null),
    getDocs(collection(db, 'promotoraSettlements')).catch(() => null),
  ]);

  const settlements: PromotoraSettlement[] = settlementsSnap
    ? settlementsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PromotoraSettlement))
    : [];

  // Lightweight client records (only id and name) to minimize network payload and client memory
  const lightClients = clients.map(c => ({
    id: c.id,
    name: c.name || 'Sin nombre',
  } as Client));

  return (
    <AguinaldosClientPage
      initialLoans={loans}
      initialPromotoras={promotoras}
      initialLocalidades={localidades}
      initialPlazas={plazas}
      initialClients={lightClients}
      initialLoanPlans={loanPlans}
      initialConfig={appConfig}
      initialSettlements={settlements}
    />
  );
}

