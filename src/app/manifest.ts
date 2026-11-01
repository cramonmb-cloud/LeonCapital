import { getAppConfig } from '@/lib/firestore-data';
import { type MetadataRoute } from 'next';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let appName = 'CrediControl';
  let pwaLogo = '/icon-192x192.png';

  try {
    const config = await getAppConfig();
    if (config?.appName) {
      appName = config.appName;
    }
    if (config?.pwaLogoUrl || config?.logoUrl) {
      pwaLogo = config.pwaLogoUrl || config.logoUrl || '/icon-192x192.png';
    }
  } catch (error) {
    console.error('Error fetching app config for manifest:', error);
  }

  return {
    name: appName,
    short_name: appName,
    description: `Gestión de préstamos para ${appName}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: pwaLogo,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: pwaLogo,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
       {
        src: pwaLogo,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: pwaLogo,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      }
    ],
  };
}
