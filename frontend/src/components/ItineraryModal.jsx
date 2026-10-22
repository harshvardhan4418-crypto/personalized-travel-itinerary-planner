import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { generateItinerary, getTripItinerary } from '../services/api'
import DayMap from './DayMap'
import { exportItineraryToPdf } from '../services/pdfExport'

// Helper to ensure itinerary data is cleanly parsed and normalized
function parseItineraryData(raw) {
  if (!raw) return null
  let data = raw
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  // In case the object is wrapped like { itinerary: { ... } }
  if (data && typeof data === 'object' && data.itinerary && typeof data.itinerary === 'object') {
    data = data.itinerary
  }
  return data && typeof data === 'object' ? data : null
}

// Helpers for Google Maps search and directions URLs
function getActivityLocationQuery(activity, destination) {
  const title = activity?.title || activity?.name || activity?.activity_name || ''
  const trimmedTitle = title.trim()
  const trimmedDest = (destination || '').trim()

  if (trimmedTitle && trimmedDest) {
    return `${trimmedTitle}, ${trimmedDest}`
  }
  return trimmedTitle || trimmedDest || ''
}

function getGoogleMapsSearchUrl(activity, destination) {
  const query = getActivityLocationQuery(activity, destination)
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function getGoogleMapsDayDirectionsUrl(activities, destination) {
  if (!Array.isArray(activities) || activities.length === 0) return null

  const locations = activities
    .map((act) => getActivityLocationQuery(act, destination))
    .filter(Boolean)

  if (locations.length === 0) return null

  if (locations.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locations[0])}`
  }

  const origin = locations[0]
  const dest = locations[locations.length - 1]
  const waypoints = locations.slice(1, -1)

  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`
  if (waypoints.length > 0) {
    url += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`
  }
  return url
}

// Currency regex mapping for strict verification
const CURRENCY_PATTERNS = {
  INR: /\b(inr|rupees?|rs\.?)\b|₹/i,
  USD: /\b(usd|dollars?)\b|\$/i,
  EUR: /\b(eur|euros?)\b|€/i,
  GBP: /\b(gbp|pounds?)\b|£/i,
  JPY: /\b(jpy|yen)\b|¥/i,
  CAD: /\b(cad)\b|c\$/i,
  AUD: /\b(aud)\b|a\$/i,
}

function calculateDaysFromDates(startStr, endStr) {
  if (!startStr || !endStr) return null
  const start = new Date(startStr)
  const end = new Date(endStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  const diffTime = end.getTime() - start.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
  return diffDays > 0 ? diffDays : null
}

function parseActivityCost(costStr, tripCurrency) {
  if (costStr === null || costStr === undefined) {
    return { valid: true, amount: 0, isFree: true }
  }
  const trimmed = String(costStr).trim()
  if (!trimmed) {
    return { valid: true, amount: 0, isFree: true }
  }
  const lower = trimmed.toLowerCase()
  if (lower === 'free' || lower === '0' || lower === 'zero' || lower === 'none' || lower === 'n/a') {
    return { valid: true, amount: 0, isFree: true }
  }

  const normTrip = (tripCurrency || 'INR').trim().toUpperCase()
  const targetPattern = CURRENCY_PATTERNS[normTrip] || new RegExp('\\b' + normTrip + '\\b', 'i')

  // Check for foreign or mismatched currencies
  for (const [code, pattern] of Object.entries(CURRENCY_PATTERNS)) {
    if (code !== normTrip && pattern.test(trimmed)) {
      return { valid: false, reason: 'mismatched', foundCurrency: code }
    }
  }

  // Must have an identifiable match with the trip currency
  if (!targetPattern.test(trimmed)) {
    return { valid: false, reason: 'unidentified' }
  }

  // Extract numeric amount
  const cleanNum = trimmed.replace(/,/g, '')
  const match = cleanNum.match(/\d+(?:\.\d+)?/)
  if (match) {
    const val = parseFloat(match[0])
    if (!isNaN(val) && val >= 0) {
      return { valid: true, amount: val, isFree: false }
    }
  }

  return { valid: false, reason: 'invalid_number' }
}

function formatCurrency(amount, currencyCode) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const code = (currencyCode || 'INR').trim().toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${code} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

function ItineraryModal({ trip, onClose, onItineraryUpdated }) {
  const [itinerary, setItinerary] = useState(() => parseItineraryData(trip?.itinerary))
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfSuccess, setPdfSuccess] = useState('')
  const [error, setError] = useState('')

  // Escape key closes modal safely
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !generating && !exportingPdf) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [generating, exportingPdf, onClose])

  useEffect(() => {
    const fetchExistingItinerary = async () => {
      setError('')
      const parsedTripItinerary = parseItineraryData(trip?.itinerary)
      if (parsedTripItinerary) {
        setItinerary(parsedTripItinerary)
        return
      }

      setLoading(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token && trip?.id) {
          const res = await getTripItinerary(trip.id, session.access_token)
          const parsedRes = parseItineraryData(res?.itinerary || res)
          if (parsedRes) {
            setItinerary(parsedRes)
          }
        }
      } catch {
        // If not found on backend yet, user can click generate
      } finally {
        setLoading(false)
      }
    }

    fetchExistingItinerary()
  }, [trip])

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('Authentication required. Please log in again.')
      }

      const response = await generateItinerary(trip.id, session.access_token)
      const parsedRes = parseItineraryData(response?.itinerary || response)

      if (parsedRes) {
        setItinerary(parsedRes)
        if (onItineraryUpdated) {
          onItineraryUpdated()
        }
      } else {
        throw new Error('Received invalid itinerary response from server.')
      }
    } catch (err) {
      setError(
        err.message || 'Failed to generate itinerary. Please try again.'
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!itinerary) return
    setExportingPdf(true)
    setError('')
    setPdfSuccess('')

    try {
      const filename = exportItineraryToPdf(trip, itinerary)
      setPdfSuccess(`Downloaded ${filename}`)
      setTimeout(() => {
        setPdfSuccess('')
      }, 5000)
    } catch (err) {
      console.error('Failed to export PDF:', err)
      setError(err.message || 'Failed to generate PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  // Track expanded state for days and activities (default expanded for all)
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedActivities, setExpandedActivities] = useState({})

  // Initialize all days and activities as expanded by default when itinerary loads or updates
  useEffect(() => {
    if (itinerary?.days && itinerary.days.length > 0) {
      setExpandedDays((prev) => {
        const next = { ...prev }
        itinerary.days.forEach((day, dayIdx) => {
          const dayId = day.day_number ?? (dayIdx + 1)
          if (next[dayId] === undefined) {
            next[dayId] = true
          }
        })
        return next
      })

      setExpandedActivities((prev) => {
        const next = { ...prev }
        itinerary.days.forEach((day, dayIdx) => {
          const dayId = day.day_number ?? (dayIdx + 1)
          const acts = day.activities || day.activity_list || []
          acts.forEach((_, actIdx) => {
            const key = `${dayId}-${actIdx}`
            if (next[key] === undefined) {
              next[key] = true
            }
          })
        })
        return next
      })
    }
  }, [itinerary])

  const toggleDay = (dayNumber, e) => {
    e?.stopPropagation()
    setExpandedDays((prev) => ({
      ...prev,
      [dayNumber]: !Boolean(prev[dayNumber] ?? true),
    }))
  }

  const toggleActivity = (activityKey, e) => {
    e?.stopPropagation()
    setExpandedActivities((prev) => ({
      ...prev,
      [activityKey]: !Boolean(prev[activityKey] ?? true),
    }))
  }

  // Budget & Cost Analysis
  const tripCurrency = (trip?.currency || 'INR').trim().toUpperCase()

  // Calculate duration in days
  const itineraryDaysCount = Array.isArray(itinerary?.days) ? itinerary.days.length : 0
  const totalDays =
    itineraryDaysCount ||
    itinerary?.total_days ||
    calculateDaysFromDates(trip?.start_date, trip?.end_date) ||
    null

  const daysLabel = totalDays === 1 ? 'day' : 'days'

  // User-defined daily budget
  const rawDailyBudget = trip?.daily_budget
  const dailyBudgetNum =
    rawDailyBudget !== null &&
    rawDailyBudget !== undefined &&
    rawDailyBudget !== '' &&
    !isNaN(Number(rawDailyBudget)) &&
    Number(rawDailyBudget) >= 0
      ? Number(rawDailyBudget)
      : null

  // Planned trip budget = daily_budget * number of trip days
  const plannedTripBudget =
    dailyBudgetNum !== null && totalDays !== null
      ? dailyBudgetNum * totalDays
      : null

  // Aggregate activity costs across all days
  let totalEstimatedCost = 0
  let unparsedCount = 0

  const dayCostBreakdowns = (itinerary?.days || []).map((day) => {
    const acts = day.activities || day.activity_list || []
    let dayTotal = 0
    let dayUnparsed = 0

    acts.forEach((act) => {
      const costStr = act.estimated_cost ?? act.cost ?? act.price ?? ''
      const parsed = parseActivityCost(costStr, tripCurrency)
      if (parsed.valid) {
        dayTotal += parsed.amount
      } else {
        dayUnparsed++
      }
    })

    totalEstimatedCost += dayTotal
    unparsedCount += dayUnparsed

    return {
      dayTotal,
      dayUnparsed,
      hasActivities: acts.length > 0,
    }
  })

  // Remaining budget & Average daily cost
  const remainingBudget =
    plannedTripBudget !== null ? plannedTripBudget - totalEstimatedCost : null
  const isOverBudget = remainingBudget !== null && remainingBudget < 0

  const averageDailyCost =
    totalDays && totalDays > 0 ? totalEstimatedCost / totalDays : null

  // Safe percentage calculation for visual progress bar
  const budgetPercentage =
    plannedTripBudget && plannedTripBudget > 0
      ? Math.min(100, Math.round((totalEstimatedCost / plannedTripBudget) * 100))
      : null

  return (
    <div
      className="itinerary-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !generating && !exportingPdf) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="itinerary-modal-title"
    >
      <div
        className="itinerary-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="itinerary-modal-header">
          <div className="itinerary-header-info">
            <span className="trip-form-eyebrow">AI TRAVEL ITINERARY</span>
            <h2 id="itinerary-modal-title">
              {trip?.destination ?? 'Trip'} Itinerary
            </h2>

            <div className="itinerary-meta-pill-row">
              {trip?.start_date && trip?.end_date && (
                <span className="itinerary-meta-chip">
                  🗓️ {trip.start_date} → {trip.end_date}
                </span>
              )}
              {totalDays !== null && (
                <span className="itinerary-meta-chip">
                  ⏱️ {totalDays} {daysLabel}
                </span>
              )}
              {trip?.travel_style && (
                <span className="itinerary-meta-chip">
                  🎒 {trip.travel_style}
                </span>
              )}
              {trip?.pace && (
                <span className="itinerary-meta-chip">
                  ⚡ {trip.pace} Pace
                </span>
              )}
              {trip?.group_size && (
                <span className="itinerary-meta-chip">
                  👥 {trip.group_size} {Number(trip.group_size) === 1 ? 'Traveler' : 'Travelers'}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {itinerary && !generating && (
              <button
                type="button"
                className="btn-pdf-export"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                title="Download itinerary as PDF"
              >
                {exportingPdf ? (
                  <>
                    <span className="spinner-dot" aria-hidden="true" style={{ width: '12px', height: '12px' }}></span>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <span>📄 Download PDF</span>
                )}
              </button>
            )}

            <button
              type="button"
              className="edit-modal-close-btn"
              onClick={onClose}
              disabled={generating || exportingPdf}
              aria-label="Close itinerary modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="itinerary-modal-body">
          {/* Feedback Alerts */}
          {error && (
            <div className="trip-form-alert trip-form-alert-error" role="alert">
              <span>⚠️</span>
              <span style={{ flex: 1 }}>{error}</span>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={handleGenerate}
              >
                Retry
              </button>
            </div>
          )}

          {pdfSuccess && (
            <div className="trip-form-alert trip-form-alert-success" role="status">
              <span>✅</span>
              <span>{pdfSuccess}</span>
            </div>
          )}

          {/* Loading or Generating State */}
          {(loading || generating) && (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div style={{ fontSize: '40px', animation: 'pulseSlow 1.5s infinite' }}>
                ✨
              </div>
              <h3 style={{ margin: 0, fontSize: '20px', fontFamily: 'var(--font-heading)', color: 'var(--color-brand-primary)' }}>
                {generating
                  ? 'Generating Your Personalized AI Itinerary...'
                  : 'Loading saved itinerary...'}
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '480px', lineHeight: 1.6 }}>
                {generating
                  ? `Consulting Groq AI with your ${trip?.travel_style || 'custom'} travel style, ${trip?.pace || 'moderate'} pace, and budget preferences to create an optimized schedule.`
                  : 'Retrieving your itinerary details.'}
              </p>
            </div>
          )}

          {/* Empty State: No Itinerary Yet */}
          {!itinerary && !loading && !generating && (
            <div className="dashboard-empty-card" style={{ padding: '48px 24px' }}>
              <div className="dashboard-empty-icon" aria-hidden="true">🧭</div>
              <h3>No Itinerary Generated Yet</h3>
              <p>
                Click below to have our AI create a custom day-wise itinerary for{' '}
                <strong>{trip?.destination}</strong> complete with attraction timings, interactive maps, and budget tracking.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerate}
                style={{ padding: '12px 24px', fontSize: '14.5px' }}
              >
                ✨ Generate AI Itinerary
              </button>
            </div>
          )}

          {/* Itinerary Display */}
          {itinerary && !loading && !generating && (
            <>
              {/* Trip Summary Box */}
              {itinerary.summary && (
                <div className="itinerary-summary-box">
                  <strong>Trip Summary:</strong> {itinerary.summary}
                </div>
              )}

              {/* Redesigned Budget & Cost Overview Card */}
              <div className="itinerary-budget-card">
                <div className="itinerary-budget-header">
                  <div className="itinerary-budget-title">
                    <span>💳</span>
                    <span>Trip Budget &amp; Cost Overview</span>
                  </div>

                  {remainingBudget !== null && (
                    <span className={`budget-status-pill ${isOverBudget ? 'over' : 'within'}`}>
                      {isOverBudget
                        ? `⚠️ Over Budget by ${formatCurrency(Math.abs(remainingBudget), tripCurrency)}`
                        : `✅ Within Budget (${formatCurrency(remainingBudget, tripCurrency)} remaining)`}
                    </span>
                  )}
                </div>

                {/* Visual Progress Bar (when budget exists) */}
                {budgetPercentage !== null && (
                  <div className="budget-progress-container">
                    <div className="budget-progress-track">
                      <div
                        className={`budget-progress-bar ${isOverBudget ? 'over' : 'within'}`}
                        style={{ width: `${budgetPercentage}%` }}
                      ></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      <span>{budgetPercentage}% of planned budget allocated</span>
                      <span>Total: {formatCurrency(plannedTripBudget, tripCurrency)}</span>
                    </div>
                  </div>
                )}

                {/* 4 Metric Columns Grid */}
                <div className="budget-metrics-grid">
                  {/* 1. Planned Trip Budget */}
                  <div className="budget-metric-card">
                    <span className="budget-metric-label">Planned Trip Budget</span>
                    <span className="budget-metric-val">
                      {plannedTripBudget !== null
                        ? formatCurrency(plannedTripBudget, tripCurrency)
                        : 'Unavailable'}
                    </span>
                    <span className="budget-metric-sub">
                      {dailyBudgetNum !== null && totalDays !== null
                        ? `${formatCurrency(dailyBudgetNum, tripCurrency)}/day × ${totalDays} ${daysLabel}`
                        : dailyBudgetNum !== null
                        ? `${formatCurrency(dailyBudgetNum, tripCurrency)}/day`
                        : 'Daily budget not set'}
                    </span>
                  </div>

                  {/* 2. Estimated Activity Costs Total */}
                  <div className="budget-metric-card">
                    <span className="budget-metric-label">Estimated Activity Costs</span>
                    <span className="budget-metric-val" style={{ color: 'var(--color-brand-accent)' }}>
                      {formatCurrency(totalEstimatedCost, tripCurrency)}
                    </span>
                    <span className="budget-metric-sub">
                      Across {totalDays !== null ? `${totalDays} ${daysLabel}` : 'all days'}
                    </span>
                  </div>

                  {/* 3. Remaining Budget */}
                  <div className="budget-metric-card">
                    <span className="budget-metric-label">Remaining Budget</span>
                    <span
                      className="budget-metric-val"
                      style={{
                        color:
                          remainingBudget === null
                            ? 'var(--color-text-secondary)'
                            : isOverBudget
                            ? 'var(--color-accent-rose)'
                            : 'var(--color-accent-emerald)',
                      }}
                    >
                      {remainingBudget !== null
                        ? formatCurrency(remainingBudget, tripCurrency)
                        : 'Unavailable'}
                    </span>
                    <span className="budget-metric-sub">
                      {remainingBudget !== null
                        ? isOverBudget
                          ? 'Exceeds planned budget'
                          : 'Left for transport/dining'
                        : 'Requires planned budget'}
                    </span>
                  </div>

                  {/* 4. Average Cost Per Day */}
                  <div className="budget-metric-card">
                    <span className="budget-metric-label">Avg. Activity Cost / Day</span>
                    <span className="budget-metric-val">
                      {averageDailyCost !== null
                        ? formatCurrency(averageDailyCost, tripCurrency)
                        : 'Unavailable'}
                    </span>
                    <span className="budget-metric-sub">
                      {totalDays !== null
                        ? `Averaged over ${totalDays} ${daysLabel}`
                        : 'Trip duration unavailable'}
                    </span>
                  </div>
                </div>

                {/* Notice if any unparsed costs */}
                {unparsedCount > 0 && (
                  <div
                    style={{
                      fontSize: '11.5px',
                      color: '#92400e',
                      backgroundColor: 'var(--color-accent-amber-bg)',
                      border: '1px solid var(--color-accent-amber-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>ℹ️</span>
                    <span>
                      Note: {unparsedCount} activity {unparsedCount === 1 ? 'cost' : 'costs'} could not be verified in {tripCurrency} and {unparsedCount === 1 ? 'was' : 'were'} excluded from numeric totals.
                    </span>
                  </div>
                )}
              </div>

              {/* Day-by-Day Sections */}
              {itinerary.days && itinerary.days.length > 0 ? (
                itinerary.days.map((day, dayIdx) => {
                  const dayId = day.day_number ?? (dayIdx + 1)
                  const isDayExpanded = expandedDays[dayId] ?? true
                  const dayTitle = day.title || day.theme || `Day ${dayId}`
                  const dayActivities = day.activities || day.activity_list || []
                  const dayBreakdown = dayCostBreakdowns[dayIdx] || { dayTotal: 0, dayUnparsed: 0 }
                  const dayCostBadge = formatCurrency(dayBreakdown.dayTotal, tripCurrency)
                  const dayRouteUrl = getGoogleMapsDayDirectionsUrl(
                    dayActivities,
                    trip?.destination || itinerary?.destination || ''
                  )

                  return (
                    <article className="itinerary-day-card" key={dayId}>
                      {/* Day Header (Clickable Toggle) */}
                      <button
                        type="button"
                        className="itinerary-day-toggle-btn"
                        onClick={(e) => toggleDay(dayId, e)}
                        aria-expanded={isDayExpanded}
                        aria-label={`Toggle Day ${dayId}: ${dayTitle}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="itinerary-day-badge">Day {dayId}</span>
                          <h4 className="itinerary-day-title">{dayTitle}</h4>
                        </div>

                        <div className="itinerary-day-meta-group">
                          <span className="itinerary-day-cost-tag">
                            💰 Est: {dayCostBadge}{dayBreakdown.dayUnparsed > 0 ? '*' : ''}
                          </span>

                          {day.date && (
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                              📅 {day.date}
                            </span>
                          )}

                          <span className="itinerary-day-collapse-indicator">
                            {isDayExpanded ? 'Collapse ▲' : 'Expand ▼'}
                          </span>
                        </div>
                      </button>

                      {/* Day Content */}
                      {isDayExpanded && (
                        <div className="itinerary-day-body">
                          {/* Embedded Day Map */}
                          <DayMap
                            dayNumber={dayId}
                            dayTitle={dayTitle}
                            destination={trip?.destination || itinerary?.destination || ''}
                            activities={dayActivities}
                          />

                          {/* Day Route & Directions Toolbar */}
                          {dayRouteUrl && (
                            <div className="itinerary-route-bar">
                              <span className="itinerary-route-stops-count">
                                🗺️ Day Route • {dayActivities.length}{' '}
                                {dayActivities.length === 1 ? 'stop' : 'stops in sequence'}
                              </span>
                              <a
                                href={dayRouteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="itinerary-route-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                🗺️ Get Day Route &amp; Directions ↗
                              </a>
                            </div>
                          )}

                          {/* Activity Items List */}
                          {dayActivities && dayActivities.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {dayActivities.map((act, actIdx) => {
                                const actKey = `${dayId}-${actIdx}`
                                const isActExpanded = Boolean(expandedActivities[actKey])
                                const title = act.title || act.name || act.activity_name || 'Activity'
                                const time = act.time || act.time_range || act.timing || ''
                                const category = act.category || act.type || ''
                                const cost = act.estimated_cost || act.cost || act.price || ''
                                const description = act.description || act.details || ''
                                const activityMapUrl = getGoogleMapsSearchUrl(
                                  act,
                                  trip?.destination || itinerary?.destination || ''
                                )

                                return (
                                  <div
                                    key={actIdx}
                                    className="itinerary-activity-item"
                                    onClick={(e) => toggleActivity(actKey, e)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        toggleActivity(actKey, e)
                                      }
                                    }}
                                  >
                                    {/* Header Row */}
                                    <div className="itinerary-activity-header">
                                      <h5 className="itinerary-activity-title">
                                        <span style={{ color: 'var(--color-brand-accent)', marginRight: '6px' }}>
                                          {actIdx + 1}.
                                        </span>
                                        {title}
                                      </h5>
                                      <button
                                        type="button"
                                        className="itinerary-activity-toggle-btn"
                                        onClick={(e) => toggleActivity(actKey, e)}
                                      >
                                        {isActExpanded ? 'Collapse ▲' : 'Expand ▼'}
                                      </button>
                                    </div>

                                    {/* Expanded Details */}
                                    {isActExpanded && (
                                      <div
                                        className="itinerary-activity-expanded-body"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="itinerary-activity-tags-row">
                                          {time && (
                                            <span className="itinerary-tag-time">
                                              🕒 {time}
                                            </span>
                                          )}
                                          {category && (
                                            <span className="itinerary-tag-category">
                                              🏷️ {category}
                                            </span>
                                          )}
                                          {cost && (
                                            <span className="itinerary-tag-cost">
                                              💰 {cost}
                                            </span>
                                          )}
                                          {activityMapUrl && (
                                            <a
                                              href={activityMapUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="itinerary-link-map"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              📍 View on Map
                                            </a>
                                          )}
                                        </div>

                                        {description ? (
                                          <p className="itinerary-activity-desc">
                                            {description}
                                          </p>
                                        ) : (
                                          <p className="itinerary-activity-desc" style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                                            No additional description provided.
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text-secondary)' }}>
                              No activities listed for this day.
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  No day plans available.
                </p>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="itinerary-modal-footer">
          {itinerary && !generating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                style={{ padding: '9px 18px', fontSize: '13px' }}
                title="Download itinerary as a formatted PDF"
              >
                {exportingPdf ? (
                  <>
                    <span className="spinner-dot" aria-hidden="true" style={{ width: '12px', height: '12px' }}></span>
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <span>📄 Download PDF</span>
                )}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleGenerate}
                disabled={generating || exportingPdf}
                style={{ padding: '9px 16px', fontSize: '13px' }}
              >
                🔄 Regenerate with AI
              </button>
            </div>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={generating || exportingPdf}
            style={{ marginLeft: 'auto', padding: '9px 18px', fontSize: '13px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ItineraryModal
