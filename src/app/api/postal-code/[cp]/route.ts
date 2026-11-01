import { NextResponse } from 'next/server';

interface PostalCodeResult {
  success: boolean;
  colony?: string;
  city?: string;
  state?: string;
  message?: string;
}

// In-memory cache for speed and to avoid duplicate network requests
const memoryCache = new Map<string, { data: PostalCodeResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cp: string }> }
) {
  try {
    const { cp } = await params;
    const cleanCp = (cp || '').replace(/\D/g, '').trim();

    if (!cleanCp || cleanCp.length < 4 || cleanCp.length > 5) {
      return NextResponse.json(
        { success: false, message: 'Código postal inválido' },
        { status: 400 }
      );
    }

    // Standardize to 5 digits (e.g. "01000")
    const formattedCp = cleanCp.padStart(5, '0');

    // Check memory cache
    const cached = memoryCache.get(formattedCp);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    let colony = '';
    let city = '';
    let state = '';

    // 1. Try sepomex.kurenn.dev
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(
        `https://sepomex.kurenn.dev/api/v1/zip_codes?zip_code=${formattedCp}`,
        {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        const zipCodes = json.zip_codes || [];
        if (Array.isArray(zipCodes) && zipCodes.length > 0) {
          const first = zipCodes[0];
          colony = first.d_asenta || first.colony || '';
          city = first.d_ciudad || first.d_mnpio || first.city || first.municipality || '';
          state = first.d_estado || first.state || '';
        }
      }
    } catch {
      // Ignore and fallback to zippopotam
    }

    // 2. Fallback to api.zippopotam.us
    if (!colony || !city) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(
          `https://api.zippopotam.us/mx/${formattedCp}`,
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          const places = json.places || [];
          if (Array.isArray(places) && places.length > 0) {
            const place = places[0];
            if (!colony) colony = place['place name'] || '';
            if (!city) city = place['place name'] || place['state'] || '';
            if (!state) state = place['state'] || '';
          }
        }
      } catch {
        // Fallback failed
      }
    }

    if (colony || city) {
      const result: PostalCodeResult = {
        success: true,
        colony: colony.toUpperCase(),
        city: city.toUpperCase(),
        state: state.toUpperCase(),
      };
      memoryCache.set(formattedCp, { data: result, timestamp: Date.now() });

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    return NextResponse.json({
      success: false,
      message: 'No se encontraron datos para el código postal',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

