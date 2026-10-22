import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodeActivities } from '../services/geocoding'

/**
 * Creates a custom teardrop pin with a legible stop number.
 */
function createNumberedPin(number) {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        background: linear-gradient(135deg, #1b5947, #2d8a6e);
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 8px rgba(15,41,34,0.35);
        border: 2px solid #ffffff;
      ">
        <span style="
          transform: rotate(45deg);
          font-size: 12px;
          font-weight: 700;
          font-family: 'Manrope', -apple-system, sans-serif;
          line-height: 1;
        ">${number}</span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  })
}

function DayMap({ dayNumber, destination, activities, dayTitle }) {
  const [isOpen, setIsOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [geocodedActivities, setGeocodedActivities] = useState([])

  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)

  const destText = (destination || '').trim()
  const validActivities = Array.isArray(activities) ? activities : []
  const firstAct = validActivities[0]
  const firstActTitle = (firstAct?.title || firstAct?.name || firstAct?.activity_name || '').trim()

  // Build query for external search link
  const searchTerms = [destText, firstActTitle].filter(Boolean).join(' ')
  const osmSearchUrl = searchTerms
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(searchTerms)}`
    : 'https://www.openstreetmap.org'

  const titlePrefix = dayTitle || (dayNumber ? `Day ${dayNumber}` : 'Day')
  const mapTitle = destText ? `${titlePrefix} Area Map • ${destText}` : `${titlePrefix} Area Map`

  // Stable activity titles signature to prevent unnecessary geocoding cancellations on re-renders
  const activitiesSignature = JSON.stringify(
    validActivities.map((a) => (a?.title || a?.name || a?.activity_name || '').trim())
  )

  // 1. Resolve coordinates asynchronously when activities signature or destination change
  useEffect(() => {
    let isMounted = true

    async function resolveCoordinates() {
      if (!Array.isArray(activities) || activities.length === 0) {
        if (isMounted) {
          setGeocodedActivities([])
          setLoading(false)
          setError(null)
        }
        return
      }

      setLoading(true)
      setError(null)

      try {
        const results = await geocodeActivities(activities, destination)
        if (isMounted) {
          setGeocodedActivities(results)
          setLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to geocode day activities.')
          setLoading(false)
        }
      }
    }

    resolveCoordinates()

    return () => {
      isMounted = false
    }
  }, [activitiesSignature, destination])

  // 2. Initialize Leaflet Map whenever the map container is mounted
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: false, // Prevents hijacking modal scroll
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    const markersLayer = L.layerGroup().addTo(map)
    markersLayerRef.current = markersLayer
    mapInstanceRef.current = map

    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 150)

    return () => {
      clearTimeout(timer)
      markersLayer.clearLayers()
      map.remove()
      mapInstanceRef.current = null
      markersLayerRef.current = null
    }
  }, [isOpen])

  // 3. Update markers and auto-fit bounds whenever map or geocodedActivities are ready
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    const validStops = []
    geocodedActivities.forEach((act, idx) => {
      if (
        act.coordinates &&
        typeof act.coordinates.lat === 'number' &&
        typeof act.coordinates.lon === 'number'
      ) {
        validStops.push({
          activity: act,
          stopNumber: idx + 1,
          lat: act.coordinates.lat,
          lon: act.coordinates.lon,
        })
      }
    })

    validStops.forEach((stop) => {
      const marker = L.marker([stop.lat, stop.lon], {
        icon: createNumberedPin(stop.stopNumber),
        title: stop.activity.title || `Stop ${stop.stopNumber}`,
      })

      const directionsQuery = [stop.activity.title, destText].filter(Boolean).join(', ')
      const popupHtml = `
        <div style="font-family: 'Manrope', -apple-system, sans-serif; font-size: 13px; line-height: 1.4; color: #18352f; min-width: 170px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="background: linear-gradient(135deg, #1b5947, #2d8a6e); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Stop ${stop.stopNumber}</span>
            ${stop.activity.time ? `<span style="font-size: 11px; color: #60716a;">🕒 ${stop.activity.time}</span>` : ''}
          </div>
          <strong style="font-size: 13px; display: block; margin-bottom: 6px; color: #18352f;">
            ${stop.activity.title || 'Activity'}
          </strong>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsQuery)}"
             target="_blank"
             rel="noopener noreferrer"
             style="color: #1b5947; font-weight: 700; font-size: 11px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            🗺️ Open Directions ↗
          </a>
        </div>
      `
      marker.bindPopup(popupHtml)
      marker.addTo(layer)
    })

    if (validStops.length === 1) {
      map.setView([validStops[0].lat, validStops[0].lon], 14)
    } else if (validStops.length > 1) {
      const bounds = L.latLngBounds(validStops.map((s) => [s.lat, s.lon]))
      map.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 15,
      })
    }

    map.invalidateSize()
  }, [isOpen, geocodedActivities, destText])

  const validPinsCount = geocodedActivities.filter(
    (act) => act.coordinates && typeof act.coordinates.lat === 'number'
  ).length
  const totalActivitiesCount = validActivities.length

  return (
    <div
      className="day-map-card"
      style={{
        backgroundColor: '#fbfaf6',
        border: '1px solid #e9e9df',
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Map Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>🗺️</span>
          <h5
            style={{
              margin: 0,
              fontSize: '13px',
              fontFamily: 'Manrope, sans-serif',
              color: '#18352f',
              fontWeight: 700,
            }}
          >
            {mapTitle}
          </h5>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsOpen((prev) => !prev)
          }}
          style={{
            fontSize: '11px',
            color: '#1b5947',
            fontWeight: 600,
            backgroundColor: '#fff',
            border: '1px solid #dce8dc',
            borderRadius: '5px',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Hide Map' : 'Show Map'}
        >
          {isOpen ? 'Hide Map ▲' : 'Show Map ▼'}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Status / Informative Note */}
          <div
            style={{
              fontSize: '11px',
              color: '#60716a',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {loading ? (
              <span>⏳ Resolving exact map pins for scheduled stops...</span>
            ) : error ? (
              <span style={{ color: '#c53030' }}>⚠️ {error}</span>
            ) : validPinsCount === totalActivitiesCount && totalActivitiesCount > 0 ? (
              <span>
                📍 All {validPinsCount} {validPinsCount === 1 ? 'stop' : 'stops'} mapped with verified coordinates.
              </span>
            ) : validPinsCount > 0 ? (
              <span>
                📍 Mapped {validPinsCount} of {totalActivitiesCount} stops with exact coordinates.
              </span>
            ) : totalActivitiesCount > 0 ? (
              <span style={{ color: '#856404' }}>
                ℹ️ Coordinates could not be verified on OpenStreetMap for these titles. Use Google Maps below for directions.
              </span>
            ) : (
              <span>No activities scheduled for this day.</span>
            )}
          </div>

          {/* Interactive Leaflet Map Container */}
          <div
            ref={mapContainerRef}
            style={{
              width: '100%',
              height: '240px',
              borderRadius: '8px',
              border: '1px solid #dcdcd0',
              overflow: 'hidden',
              position: 'relative',
              zIndex: 1,
              backgroundColor: '#e5e3df',
            }}
          />

          {/* External OSM Search Action Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              paddingTop: '2px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#60716a' }}>
              Base tiles & geocoding © OpenStreetMap contributors
            </span>

            {searchTerms && (
              <a
                href={osmSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#1b5947',
                  backgroundColor: '#fff',
                  border: '1px solid #dce8dc',
                  padding: '3px 9px',
                  borderRadius: '5px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f7f0')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
              >
                🔍 Explore on OpenStreetMap
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default DayMap
