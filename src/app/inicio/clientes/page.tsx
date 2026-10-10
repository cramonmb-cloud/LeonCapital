import { getClients, getActiveLoans, getLocalidades, getPromotoras, getPersonal } from '@/lib/firestore-data';
import { ClientsClientPage } from '@/components/clients-client-page';

export default async function ClientsPage() {
  const [clients, loans, localidades, promotoras, personal] = await Promise.all([
    getClients(),
    getActiveLoans(),
    getLocalidades(),
    getPromotoras(),
    getPersonal(),
  ]);

  return (
    <ClientsClientPage
      initialClients={clients}
      initialLoans={loans}
      initialLocalidades={localidades}
      initialPromotoras={promotoras}
      initialPersonal={personal}
    />
  );
}
