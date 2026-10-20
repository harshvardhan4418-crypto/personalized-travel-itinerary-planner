/**
 * Geocoding Service for Personalized Travel Itinerary Planner
 * 
 * Uses OpenStreetMap Nominatim API to resolve attraction names + destinations
 * into accurate latitude/longitude coordinates.
 * 
 * Adheres strictly to Nominatim Usage Policy:
 * - Enforces sequential execution with >= 1000ms delay between network requests.
 * - Supports AbortSignal to cleanly cancel stale/unmounted requests without wasting queue time.
 * - Caches successful and negative results in memory and sessionStorage.
 * - Gracefully returns null on network errors or missing locations (zero fake coordinates).
 */

const memoryCache = new Map()
const STORAGE_KEY_PREFIX = 'geo_cache_'
const MIN_REQUEST_INTERVAL_MS = 1050 // Safe margin >= 1s per Nominatim policy

let lastRequestTimestamp = 0
let requestQueue = Promise.resolve()

function getCache(key) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key)
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(STORAGE_KEY_PREFIX + key)
      if (stored) {
        const parsed = JSON.parse(stored)
        memoryCache.set(key, parsed)
        return parsed
      }
    }
  } catch {
    // sessionStorage unavailable or access restricted
  }
  return undefined
}

function setCache(key, value) {
  memoryCache.set(key, value)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(value))
    }
  } catch {
    // Storage quota exceeded or disabled
  }
}

/**
 * Ensures network requests are executed sequentially with at least 1-second interval.
 * Immediately skips execution if an AbortSignal is already triggered.
 */
function throttleRequest(fn, signal) {
  const task = requestQueue.then(async () => {
    if (signal && signal.aborted) {
      return null
    }

    const now = Date.now()
    const elapsed = now - lastRequestTimestamp
    if (elapsed < MIN_REQUEST_INTERVAL_MS && lastRequestTimestamp > 0) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed))
    }

    if (signal && signal.aborted) {
      return null
    }

    try {
      const result = await fn()
      return result
    } finally {
      lastRequestTimestamp = Date.now()
    }
  })

  // Prevent queue interruption if a promise rejects
  requestQueue = task.catch(() => {})
  return task
}

/**
 * Builds a search query by combining attraction name with destination.
 */
export function buildGeocodeQuery(attractionName, destination) {
  const cleanAttraction = (attractionName || '').trim()
  const cleanDest = (destination || '').trim()

  if (cleanAttraction && cleanDest) {
    return `${cleanAttraction}, ${cleanDest}`
  }
  return cleanAttraction || cleanDest || ''
}

/**
 * Directly queries Nominatim API without cache.
 */
async function fetchFromNominatim(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`

  try {
    const response = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    const item = data[0]
    const lat = parseFloat(item.lat)
    const lon = parseFloat(item.lon)

    if (isNaN(lat) || isNaN(lon)) {
      return null
    }

    return {
      lat,
      lon,
      displayName: item.display_name || query,
    }
  } catch {
    // Network failure, timeout, abort, or CORS restriction
    return null
  }
}

/**
 * Geocodes an attraction location using cache first, falling back to throttled Nominatim search.
 * Returns { lat, lon, displayName } or null.
 */
export async function geocodeLocation(attractionName, destination, signal) {
  if (signal && signal.aborted) return null

  const query = buildGeocodeQuery(attractionName, destination)
  if (!query) return null

  const cacheKey = query.toLowerCase()
  const cached = getCache(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const result = await throttleRequest(() => fetchFromNominatim(query, signal), signal)
  if (result !== null && (!signal || !signal.aborted)) {
    setCache(cacheKey, result)
  }
  return result
}

/**
 * Geocodes an array of activities sequentially for a given destination.
 * Returns array of activities with an added `coordinates` property ({ lat, lon, displayName } or null).
 */
export async function geocodeActivities(activities, destination, signal) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return []
  }

  const results = []
  for (const activity of activities) {
    if (signal && signal.aborted) break
    const title = activity?.title || activity?.name || activity?.activity_name || ''
    const coordinates = await geocodeLocation(title, destination, signal)
    results.push({
      ...activity,
      coordinates,
    })
  }
  return results
}

/**
 * Synchronous lookup in cache without initiating a network request.
 */
export function getCachedCoordinates(attractionName, destination) {
  const query = buildGeocodeQuery(attractionName, destination)
  if (!query) return null
  const cached = getCache(query.toLowerCase())
  return cached || null
}

/**
 * Clears in-memory and sessionStorage geocode cache.
 */
export function clearGeocodeCache() {
  memoryCache.clear()
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const keysToRemove = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i)
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k))
    }
  } catch {
    // Ignore
  }
}
