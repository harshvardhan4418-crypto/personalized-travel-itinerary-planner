
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export async function checkBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/health`)

  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status}`)
  }

  return response.json()
}

export { API_BASE_URL }

export async function getTrips() {
  const response = await fetch(`${API_BASE_URL}/trips/`)

  if (!response.ok) {
    throw new Error(`Failed to fetch trips: ${response.status}`)
  }

  return response.json()
}

export async function generateItinerary(tripId, token) {
  const response = await fetch(`${API_BASE_URL}/itineraries/${tripId}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    let errorDetail = `Generation failed (${response.status})`
    try {
      const errorData = await response.json()
      if (errorData && errorData.detail) {
        errorDetail = errorData.detail
      }
    } catch {
      // Fallback to errorDetail
    }
    throw new Error(errorDetail)
  }

  return response.json()
}

export async function getTripItinerary(tripId, token) {
  const response = await fetch(`${API_BASE_URL}/itineraries/${tripId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    let errorDetail = `Failed to fetch itinerary (${response.status})`
    try {
      const errorData = await response.json()
      if (errorData && errorData.detail) {
        errorDetail = errorData.detail
      }
    } catch {
      // Fallback to errorDetail
    }
    throw new Error(errorDetail)
  }

  return response.json()
}


