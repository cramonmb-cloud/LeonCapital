import { getClients, getLoanPlans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { LoansClientPage } from '@/components/loans-client-page';

export default async function LoansPageContainer() {
  // Fetch data that is less likely to change in real-time or needed for initial setup
  const [clients, loanPlans, plazas, localidades, promotoras, config] = await Promise.all([
    getClients(),
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras(),
    getAppConfig(),
  ]);

  return <LoansClientPage 
            initialClients={clients} 
            initialLoanPlans={loanPlans} 
            initialPlazas={plazas} 
            initialLocalidades={localidades} 
            initialPromotoras={promotoras} 
            initialConfig={config}
        />;
}
