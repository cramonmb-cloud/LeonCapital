import { getClients, getActiveLoans, getLoanPlans, getPlazas, getLocalidades, getPromotoras } from '@/lib/firestore-data';
import { AvalesClientPage } from '@/components/avales-client-page';

export default async function AvalesPage() {
  const [clients, loans, plans, plazas, localidades, promotoras] = await Promise.all([
    getClients(),
    getActiveLoans(),
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras()
  ]);

  return (
    <AvalesClientPage 
      initialClients={clients} 
      initialLoans={loans} 
      initialPlans={plans} 
      initialPlazas={plazas}
      initialLocalidades={localidades}
      initialPromotoras={promotoras}
    />
  );
}

