import { getClients, getLoanPlans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { PrecapturaClientPage } from '@/components/precaptura-client-page';

export default async function PrecapturaPage() {
  const [clients, loanPlans, plazas, localidades, promotoras, appConfig] = await Promise.all([
    getClients(),
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras(),
    getAppConfig(),
  ]);

  return (
    <PrecapturaClientPage
      initialClients={clients}
      initialLoanPlans={loanPlans}
      initialPlazas={plazas}
      initialLocalidades={localidades}
      initialPromotoras={promotoras}
      initialConfig={appConfig}
    />
  );
}
