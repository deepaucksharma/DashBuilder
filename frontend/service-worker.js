/**
 * Service Worker for DashBuilder
 * Provides offline support, caching, and background sync
 */

const CACHE_VERSION = 'dashbuilder-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles/dashbuilder-app.css',
  '/styles/query-builder.css',
  '/styles/adaptive-widgets.css',
  '/dashbuilder-app.js',
  '/visual-query-builder.js',
  '/nrql-autocomplete.js',
  '/adaptive-widgets.js',
  '/chart-renderers.js',
  '/error-boundary.js',
  '/security-layer.js'
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Static assets - cache first
  static: {
    pattern: /\.(js|css|png|jpg|jpeg|svg|gif|woff2?)$/,
    cache: STATIC_CACHE,
    strategy: 'cacheFirst'
  },
  
  // API calls - network first with cache fallback
  api: {
    pattern: /\/api\//,
    cache: DATA_CACHE,
    strategy: 'networkFirst',
    ttl: 5 * 60 * 1000 // 5 minutes
  },
  
  // Dashboard data - stale while revalidate
  dashboards: {
    pattern: /\/dashboards\//,
    cache: DATA_CACHE,
    strategy: 'staleWhileRevalidate',
    ttl: 60 * 60 * 1000 // 1 hour
  },
  
  // NerdGraph queries - cache with network update
  nerdgraph: {
    pattern: /graphql/,
    cache: DATA_CACHE,
    strategy: 'cacheWithNetworkUpdate',
    ttl: 2 * 60 * 1000 // 2 minutes
  }
};

// Background sync tags
const SYNC_TAGS = {
  DASHBOARD_SAVE: 'dashboard-save',
  METRICS_UPLOAD: 'metrics-upload',
  ERROR_REPORT: 'error-report'
};

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[ServiceWorker] Install complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(error => {
        console.error('[ServiceWorker] Install failed:', error);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              return cacheName.startsWith('dashbuilder-') && 
                     !cacheName.startsWith(CACHE_VERSION);
            })
            .map(cacheName => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activate complete');
        return self.clients.claim(); // Take control immediately
      })
  );
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Determine cache strategy
  const strategy = getCacheStrategy(url, request);
  
  if (strategy) {
    event.respondWith(
      executeStrategy(request, strategy)
        .catch(error => {
          console.error('[ServiceWorker] Fetch error:', error);
          return offlineFallback(request);
        })
    );
  }
});

/**
 * Get cache strategy for request
 */
function getCacheStrategy(url, request) {
  // Check each strategy pattern
  for (const [name, config] of Object.entries(CACHE_STRATEGIES)) {
    if (config.pattern.test(url.pathname)) {
      return config;
    }
  }
  
  // Default strategy for HTML pages
  if (request.mode === 'navigate') {
    return {
      cache: DYNAMIC_CACHE,
      strategy: 'networkFirst'
    };
  }
  
  return null;
}

/**
 * Execute cache strategy
 */
async function executeStrategy(request, strategy) {
  switch (strategy.strategy) {
    case 'cacheFirst':
      return cacheFirst(request, strategy);
      
    case 'networkFirst':
      return networkFirst(request, strategy);
      
    case 'staleWhileRevalidate':
      return staleWhileRevalidate(request, strategy);
      
    case 'cacheWithNetworkUpdate':
      return cacheWithNetworkUpdate(request, strategy);
      
    default:
      return fetch(request);
  }
}

/**
 * Cache first strategy
 */
async function cacheFirst(request, config) {
  const cache = await caches.open(config.cache);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const networkResponse = await fetch(request);
  
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

/**
 * Network first strategy
 */
async function networkFirst(request, config) {
  try {
    const networkResponse = await fetchWithTimeout(request, 5000);
    
    if (networkResponse.ok) {
      const cache = await caches.open(config.cache);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(config.cache);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[ServiceWorker] Network failed, serving from cache');
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Stale while revalidate strategy
 */
async function staleWhileRevalidate(request, config) {
  const cache = await caches.open(config.cache);
  const cachedResponse = await cache.match(request);
  
  // Serve from cache immediately
  const responsePromise = cachedResponse || fetch(request);
  
  // Update cache in background
  event.waitUntil(
    fetch(request)
      .then(response => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(error => {
        console.log('[ServiceWorker] Background update failed:', error);
      })
  );
  
  return responsePromise;
}

/**
 * Cache with network update strategy
 */
async function cacheWithNetworkUpdate(request, config) {
  const cache = await caches.open(config.cache);
  const cachedResponse = await cache.match(request);
  
  // Check if cached response is still fresh
  if (cachedResponse && isFresh(cachedResponse, config.ttl)) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      console.log('[ServiceWorker] Network failed, serving stale cache');
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * Fetch with timeout
 */
function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Fetch timeout')), timeout)
    )
  ]);
}

/**
 * Check if cached response is fresh
 */
function isFresh(response, ttl) {
  const cachedTime = response.headers.get('sw-cached-time');
  if (!cachedTime) return false;
  
  const age = Date.now() - parseInt(cachedTime);
  return age < ttl;
}

/**
 * Offline fallback
 */
async function offlineFallback(request) {
  if (request.mode === 'navigate') {
    const cache = await caches.open(STATIC_CACHE);
    return cache.match('/offline.html') || createOfflineResponse();
  }
  
  // Return offline placeholder for images
  if (request.destination === 'image') {
    return new Response(
      '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999">Offline</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  
  // Return error for API calls
  if (request.url.includes('/api/')) {
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'No internet connection' }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  throw new Error('Offline');
}

/**
 * Create offline response
 */
function createOfflineResponse() {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Offline - DashBuilder</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .offline-message {
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        p { color: #666; }
        button {
          margin-top: 20px;
          padding: 10px 20px;
          background: #0366d6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="offline-message">
        <h1>You're Offline</h1>
        <p>DashBuilder requires an internet connection to function properly.</p>
        <p>Your work has been saved locally and will sync when you're back online.</p>
        <button onclick="location.reload()">Try Again</button>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * Background sync event
 */
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  switch (event.tag) {
    case SYNC_TAGS.DASHBOARD_SAVE:
      event.waitUntil(syncDashboards());
      break;
      
    case SYNC_TAGS.METRICS_UPLOAD:
      event.waitUntil(syncMetrics());
      break;
      
    case SYNC_TAGS.ERROR_REPORT:
      event.waitUntil(syncErrors());
      break;
      
    default:
      // Handle custom sync tags
      if (event.tag.startsWith('sync-')) {
        event.waitUntil(syncCustomData(event.tag));
      }
  }
});

/**
 * Sync dashboards
 */
async function syncDashboards() {
  const db = await openDB();
  const tx = db.transaction('pending-saves', 'readonly');
  const store = tx.objectStore('pending-saves');
  const saves = await store.getAll();
  
  for (const save of saves) {
    try {
      const response = await fetch('/api/dashboards', {
        method: save.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Id': save.id
        },
        body: JSON.stringify(save.data)
      });
      
      if (response.ok) {
        // Remove from pending
        const deleteTx = db.transaction('pending-saves', 'readwrite');
        await deleteTx.objectStore('pending-saves').delete(save.id);
        
        // Notify client
        await notifyClients('dashboard-synced', {
          dashboardId: save.data.id,
          syncId: save.id
        });
      }
    } catch (error) {
      console.error('[ServiceWorker] Dashboard sync failed:', error);
    }
  }
}

/**
 * Sync metrics
 */
async function syncMetrics() {
  const db = await openDB();
  const tx = db.transaction('metrics', 'readonly');
  const store = tx.objectStore('metrics');
  const metrics = await store.getAll();
  
  if (metrics.length === 0) return;
  
  try {
    const response = await fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics })
    });
    
    if (response.ok) {
      // Clear synced metrics
      const clearTx = db.transaction('metrics', 'readwrite');
      await clearTx.objectStore('metrics').clear();
    }
  } catch (error) {
    console.error('[ServiceWorker] Metrics sync failed:', error);
  }
}

/**
 * Sync error reports
 */
async function syncErrors() {
  const db = await openDB();
  const tx = db.transaction('errors', 'readonly');
  const store = tx.objectStore('errors');
  const errors = await store.getAll();
  
  for (const error of errors) {
    try {
      const response = await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error)
      });
      
      if (response.ok) {
        const deleteTx = db.transaction('errors', 'readwrite');
        await deleteTx.objectStore('errors').delete(error.id);
      }
    } catch (err) {
      console.error('[ServiceWorker] Error sync failed:', err);
    }
  }
}

/**
 * Message event - handle client messages
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_URLS':
      event.waitUntil(cacheUrls(data.urls));
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(clearCache(data.cache));
      break;
      
    case 'SAVE_OFFLINE':
      event.waitUntil(saveOfflineData(data));
      break;
  }
});

/**
 * Cache specific URLs
 */
async function cacheUrls(urls) {
  const cache = await caches.open(DYNAMIC_CACHE);
  await cache.addAll(urls);
}

/**
 * Clear specific cache
 */
async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName);
  } else {
    // Clear all caches
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(name => caches.delete(name))
    );
  }
}

/**
 * Save data for offline access
 */
async function saveOfflineData(data) {
  const db = await openDB();
  const tx = db.transaction(data.store, 'readwrite');
  const store = tx.objectStore(data.store);
  
  await store.put({
    ...data.value,
    id: data.id || Date.now(),
    timestamp: Date.now()
  });
  
  // Register for background sync if needed
  if (data.sync) {
    await self.registration.sync.register(data.syncTag || 'sync-data');
  }
}

/**
 * Open IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dashbuilder-offline', 1);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores
      if (!db.objectStoreNames.contains('pending-saves')) {
        db.createObjectStore('pending-saves', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('metrics')) {
        db.createObjectStore('metrics', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('errors')) {
        db.createObjectStore('errors', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('offline-data')) {
        db.createObjectStore('offline-data', { keyPath: 'id' });
      }
    };
  });
}

/**
 * Notify all clients
 */
async function notifyClients(type, data) {
  const clients = await self.clients.matchAll({ type: 'window' });
  
  clients.forEach(client => {
    client.postMessage({
      type: `sw-${type}`,
      data
    });
  });
}

/**
 * Push event - handle push notifications
 */
self.addEventListener('push', (event) => {
  const options = {
    body: 'New dashboard update available',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View Dashboard'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  if (event.data) {
    const data = event.data.json();
    Object.assign(options, data);
  }
  
  event.waitUntil(
    self.registration.showNotification('DashBuilder', options)
  );
});

/**
 * Notification click event
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/dashboards')
    );
  }
});

console.log('[ServiceWorker] Loaded');