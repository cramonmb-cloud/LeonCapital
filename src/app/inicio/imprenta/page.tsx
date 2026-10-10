import { ImprentaClientPage } from '@/components/imprenta-client-page';
import { getAppConfig } from '@/lib/firestore-data';

export default async function ImprentaPage() {
  const config = await getAppConfig();
  return <ImprentaClientPage initialIframeUrl={config?.imprentaIframeUrl} />;
}
