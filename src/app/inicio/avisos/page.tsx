import { AvisosClientPage } from '@/components/avisos-client-page';
import { getAppConfig } from '@/lib/firestore-data';

export default async function AvisosPage() {
  const config = await getAppConfig();
  return <AvisosClientPage imgbbApiKey={config?.imgbbApiKey} />;
}
