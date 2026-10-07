import { getClients, getActiveLoans, getLoanPlans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { ConsultarClientePage } from '@/components/consultar-cliente-page';

export default async function ConsultarClienteContainer() {
  const [clients, loans, loanPlans, plazas, localidades, promotoras, config] = await Promise.all([
    getClients(),
    getActiveLoans(),
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras(),
    getAppConfig(),
  ]);

  return <ConsultarClientePage 
            clients={clients} 
            loans={loans} 
            loanPlans={loanPlans} 
            plazas={plazas}
            localidades={localidades}
            promotoras={promotoras}
            appConfig={config}
        />;
}
