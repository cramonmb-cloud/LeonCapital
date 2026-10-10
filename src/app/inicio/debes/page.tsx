import { getClients, getLoanPlans, getPlazas, getLocalidades, getPromotoras } from '@/lib/firestore-data';
import { DebesClientPage } from '@/components/debes-client-page';

export default async function DebesPageContainer() {
  const [clients, loanPlans, plazas, localidades, promotoras] = await Promise.all([
    getClients(),
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras(),
  ]);

  return <DebesClientPage 
            initialClients={clients} 
            initialLoanPlans={loanPlans} 
            initialPlazas={plazas} 
            initialLocalidades={localidades} 
            initialPromotoras={promotoras} 
        />;
}
