// Register service worker in browser environments and pre-cache scripts & styles

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Wait until controller is set or ready
    await navigator.serviceWorker.ready;

    // Cache current page scripts, styles, and document into CacheStorage
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open('rivet-shell-v1');
        const urls: string[] = [window.location.pathname];

        document.querySelectorAll('script[src]').forEach((el) => {
          const src = el.getAttribute('src');
          if (src && (src.startsWith('/') || src.startsWith(window.location.origin))) {
            urls.push(src);
          }
        });

        document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
          const href = el.getAttribute('href');
          if (href && (href.startsWith('/') || href.startsWith(window.location.origin))) {
            urls.push(href);
          }
        });

        await Promise.allSettled(
          urls.map(async (u) => {
            try {
              const res = await fetch(u);
              if (res.ok) await cache.put(u, res);
            } catch {
              // Ignore individual fetch errors
            }
          })
        );
      } catch (cacheErr) {
        console.debug('[SW] Cache assets error:', cacheErr);
      }
    }

    // Check for Android Background Sync API
    if ('sync' in registration) {
      try {
        await (registration as any).sync.register('sync-commands');
      } catch (err) {
        console.debug('Background sync registration deferred:', err);
      }
    }

    return registration;
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
    return null;
  }
}
