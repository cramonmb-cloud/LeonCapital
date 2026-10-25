import { getLoanPlans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { getWeeklyClosuresListAction } from './actions';
import { CierreSemanalClientPage } from '@/components/cierre-semanal-client-page';

export const metadata = {
  title: 'Cierre Semanal | CrediControl',
  description: 'Cierre y congelamiento definitivo de liquidaciones semanales por plaza o empresa.',
};

export default async function CierreSemanalPage() {
  const [loanPlans, plazas, localidades, promotoras, appConfig, closures] = await Promise.all([
    getLoanPlans(),
    getPlazas(),
    getLocalidades(),
    getPromotoras(),
    getAppConfig(),
    getWeeklyClosuresListAction(),
  ]);

  return (
    <CierreSemanalClientPage
      initialLoanPlans={loanPlans}
      initialPlazas={plazas}
      initialLocalidades={localidades}
      initialPromotoras={promotoras}
      initialConfig={appConfig}
      initialClosures={closures}
    />
  );
}
