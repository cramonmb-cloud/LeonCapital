import { getClients, getLoanPlans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { ControlClientPage } from '@/components/control-client-page';

export default async function ControlPage() {
    const [clients, loanPlans, plazas, localidades, promotoras, config] = await Promise.all([
        getClients(),
        getLoanPlans(),
        getPlazas(),
        getLocalidades(),
        getPromotoras(),
        getAppConfig(),
    ]);

    return <ControlClientPage 
                initialClients={clients} 
                initialLoanPlans={loanPlans}
                initialPlazas={plazas}
                initialLocalidades={localidades}
                initialPromotoras={promotoras}
                initialConfig={config}
            />;
}
