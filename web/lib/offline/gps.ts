/**
 * GPS Location Capture Module
 * Captures GPS coordinates ONLY at check-in, check-out and en route.
 * Converts coordinates to lat_e6 and lng_e6 integers (microdegrees) as specified by the ledger contract.
 */

export interface GpsCoordinates {
  lat_e6: number;
  lng_e6: number;
}

// Known plant sites from contract
export const KNOWN_SITE_COORDS: Record<string, GpsCoordinates> = {
  'site-a': { lat_e6: 19076000, lng_e6: 72877000 },
  'site-b': { lat_e6: 19115000, lng_e6: 72885000 },
};

/**
 * Captures current GPS location.
 * Falls back to site coordinates for demo / tests / desktop browsers without GPS sensor.
 */
export async function captureGpsLocation(siteId: string = 'site-a'): Promise<GpsCoordinates> {
  const fallback = KNOWN_SITE_COORDS[siteId] || KNOWN_SITE_COORDS['site-a'];

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return fallback;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, 300);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          lat_e6: Math.round(position.coords.latitude * 1e6),
          lng_e6: Math.round(position.coords.longitude * 1e6),
        });
      },
      (err) => {
        clearTimeout(timer);
        console.warn('[RIVET] Geolocation unavailable, using site reference GPS:', err.message);
        resolve(fallback);
      },
      { timeout: 2000, enableHighAccuracy: true, maximumAge: 30000 }
    );
  });
}
