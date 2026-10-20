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

  return (
    <div
      className="itinerary-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !generating) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(24, 53, 47, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '12px',
      }}
    >
      <div
        className="itinerary-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '18px',
          maxWidth: '900px',
          width: '100%',
          height: '90vh',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.2)',
          border: '1px solid #e9e9df',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          className="itinerary-modal-header"
          style={{
            flex: '0 0 auto',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '22px 28px 16px',
            borderBottom: '1px solid #eef2ee',
            backgroundColor: '#fff',
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: '0 0 4px' }}>
              AI TRAVEL ITINERARY
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: '24px',
                fontFamily: 'Manrope, sans-serif',
                color: '#18352f',
              }}
            >
              {trip?.destination ?? 'Trip'} Itinerary
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: '#60716a',
              }}
            >
              {trip?.start_date && trip?.end_date
                ? `${trip.start_date} to ${trip.end_date}`
                : 'Dates not set'}{' '}
              • {trip?.travel_style ?? 'Standard'} • {trip?.pace ?? 'Moderate'}{' '}
              pace
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {itinerary && !generating && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                style={{
                  backgroundColor: '#eef5ee',
                  border: '1px solid #c2dac2',
                  color: '#1b5947',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: exportingPdf ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'background-color 0.15s ease',
                }}
                title="Download itinerary as PDF"
              >
                {exportingPdf ? '⏳ Exporting...' : '📄 Download PDF'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '22px',
                cursor: generating ? 'not-allowed' : 'pointer',
                color: '#60716a',
                padding: '4px 8px',
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          className="itinerary-modal-body"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehaviorY: 'contain',
            padding: '20px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Error Banner */}
          {error && (
            <div
              style={{
                color: '#c53030',
                backgroundColor: '#fff5f5',
                border: '1px solid #feb2b2',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexShrink: 0,
              }}
            >
              <span>{error}</span>
              <button
                onClick={handleGenerate}
                style={{
                  backgroundColor: '#c53030',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading or Generating State */}
          {(loading || generating) && (
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: '36px',
                  animation: 'pulse 1.5s infinite',
                }}
              >
                ✨
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '18px',
                  color: '#1b5947',
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                {generating
                  ? 'Generating Your Personalized AI Itinerary...'
                  : 'Loading saved itinerary...'}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#60716a',
                  maxWidth: '460px',
                  lineHeight: 1.6,
                }}
              >
                {generating
                  ? `Consulting Groq AI with your ${trip?.travel_style} travel style, ${trip?.pace} pace, and daily budget to build an optimized day-by-day plan.`
                  : 'Retrieving your itinerary details.'}
              </p>
            </div>
          )}

          {/* Empty State: No Itinerary Yet */}
          {!itinerary && !loading && !generating && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#fbfaf6',
                borderRadius: '14px',
                border: '1px dashed #dcdcd0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '38px' }}>🧭</span>
              <h3
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                No Itinerary Generated Yet
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#60716a',
                  maxWidth: '480px',
                  lineHeight: 1.6,
                }}
              >
                Click below to have our AI create a custom day-wise itinerary
                for <strong>{trip?.destination}</strong> complete with
                activities, timing recommendations, and cost estimates.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={handleGenerate}
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                ✨ Generate AI Itinerary
              </button>
            </div>
          )}

          {/* Itinerary Display */}
          {itinerary && !loading && !generating && (
            <>
              {/* Summary Card */}
              {itinerary.summary && (
                <div
                  style={{
                    backgroundColor: '#eef5ee',
                    border: '1px solid #dce8dc',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    color: '#2d473e',
                    lineHeight: 1.6,
                    flexShrink: 0,
                  }}
                >
                  <strong>Trip Summary:</strong> {itinerary.summary}
                </div>
              )}

              {/* Trip Budget & Cost Overview Card */}
              <div
                className="itinerary-budget-card"
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8e2',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                }}
              >
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
                    <span style={{ fontSize: '18px' }}>💳</span>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '15px',
                        fontFamily: 'Manrope, sans-serif',
                        color: '#18352f',
                        fontWeight: 700,
                      }}
                    >
                      Trip Budget & Cost Overview
                    </h4>
                  </div>

                  {remainingBudget !== null && (
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: isOverBudget ? '#fff5f5' : '#f0fff4',
                        color: isOverBudget ? '#c53030' : '#22543d',
                        border: isOverBudget ? '1px solid #feb2b2' : '1px solid #9ae6b4',
                      }}
                    >
                      {isOverBudget
                        ? `⚠️ Over Budget by ${formatCurrency(Math.abs(remainingBudget), tripCurrency)}`
                        : `✅ Within Budget (${formatCurrency(remainingBudget, tripCurrency)} remaining)`}
                    </span>
                  )}
                </div>

                {/* 4 Metric Columns Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {/* 1. Planned Trip Budget */}
                  <div
                    style={{
                      backgroundColor: '#fbfaf6',
                      border: '1px solid #edece6',
                      borderRadius: '9px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#60716a', fontWeight: 600 }}>
                      Planned Trip Budget
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#18352f' }}>
                      {plannedTripBudget !== null
                        ? formatCurrency(plannedTripBudget, tripCurrency)
                        : 'Unavailable'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8c9e96' }}>
                      {dailyBudgetNum !== null && totalDays !== null
                        ? `${formatCurrency(dailyBudgetNum, tripCurrency)}/day × ${totalDays} ${daysLabel}`
                        : dailyBudgetNum !== null
                        ? `${formatCurrency(dailyBudgetNum, tripCurrency)}/day`
                        : 'Daily budget not set'}
                    </span>
                  </div>

                  {/* 2. Estimated Activity Costs Total */}
                  <div
                    style={{
                      backgroundColor: '#fbfaf6',
                      border: '1px solid #edece6',
                      borderRadius: '9px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#60716a', fontWeight: 600 }}>
                      Estimated Activity Costs
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1b5947' }}>
                      {formatCurrency(totalEstimatedCost, tripCurrency)}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8c9e96' }}>
                      Across {totalDays !== null ? `${totalDays} ${daysLabel}` : 'all days'}
                    </span>
                  </div>

                  {/* 3. Remaining Budget */}
                  <div
                    style={{
                      backgroundColor: '#fbfaf6',
                      border: '1px solid #edece6',
                      borderRadius: '9px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#60716a', fontWeight: 600 }}>
                      Remaining Budget
                    </span>
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color:
                          remainingBudget === null
                            ? '#60716a'
                            : isOverBudget
                            ? '#c53030'
                            : '#22543d',
                      }}
                    >
                      {remainingBudget !== null
                        ? formatCurrency(remainingBudget, tripCurrency)
                        : 'Unavailable'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8c9e96' }}>
                      {remainingBudget !== null
                        ? isOverBudget
                          ? 'Exceeds planned budget'
                          : 'Left for transport/dining'
                        : 'Requires planned budget'}
                    </span>
                  </div>

                  {/* 4. Average Cost Per Day */}
                  <div
                    style={{
                      backgroundColor: '#fbfaf6',
                      border: '1px solid #edece6',
                      borderRadius: '9px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#60716a', fontWeight: 600 }}>
                      Avg. Activity Cost / Day
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#18352f' }}>
                      {averageDailyCost !== null
                        ? formatCurrency(averageDailyCost, tripCurrency)
                        : 'Unavailable'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8c9e96' }}>
                      {totalDays !== null
                        ? `Averaged over ${totalDays} ${daysLabel}`
                        : 'Trip duration unavailable'}
                    </span>
                  </div>
                </div>

                {/* Incomplete Estimate Notice if any costs were unparsed */}
                {unparsedCount > 0 && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#856404',
                      backgroundColor: '#fff3cd',
                      border: '1px solid #ffeeba',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>ℹ️</span>
                    <span>
                      Note: {unparsedCount} activity cost {unparsedCount === 1 ? 'estimate' : 'estimates'} could not be verified in {tripCurrency} and {unparsedCount === 1 ? 'was' : 'were'} excluded from numeric totals.
                    </span>
                  </div>
                )}
              </div>

              {/* Day-by-Day Cards */}
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
                    <div
                      key={dayId}
                      style={{
                        border: '1px solid #e9e9df',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        backgroundColor: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {/* Day Header (Clickable Expand/Collapse) */}
                      <button
                        type="button"
                        onClick={(e) => toggleDay(dayId, e)}
                        aria-expanded={isDayExpanded}
                        aria-label={`Toggle Day ${dayId}: ${dayTitle}`}
                        style={{
                          width: '100%',
                          background: '#fbfaf6',
                          border: 'none',
                          borderBottom: isDayExpanded ? '1px solid #e9e9df' : 'none',
                          padding: '14px 18px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                          }}
                        >
                          <span
                            style={{
                              backgroundColor: '#1b5947',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '12px',
                              padding: '3px 9px',
                              borderRadius: '6px',
                            }}
                          >
                            Day {dayId}
                          </span>
                          <h4
                            style={{
                              margin: 0,
                              fontSize: '16px',
                              fontFamily: 'Manrope, sans-serif',
                              color: '#18352f',
                            }}
                          >
                            {dayTitle}
                          </h4>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {/* Day Activity Cost Estimate Badge */}
                          <span
                            style={{
                              fontSize: '12px',
                              color: '#18352f',
                              fontWeight: 600,
                              backgroundColor: '#fff',
                              border: '1px solid #dce8dc',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            💰 Est: {dayCostBadge}{dayBreakdown.dayUnparsed > 0 ? '*' : ''}
                          </span>

                          {day.date && (
                            <span
                              style={{
                                fontSize: '12px',
                                color: '#60716a',
                                fontWeight: 500,
                              }}
                            >
                              📅 {day.date}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '12px',
                              color: '#1b5947',
                              fontWeight: 600,
                              backgroundColor: '#fff',
                              border: '1px solid #dce8dc',
                              borderRadius: '6px',
                              padding: '3px 10px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            {isDayExpanded ? 'Collapse ▲' : 'Expand ▼'}
                          </span>
                        </div>
                      </button>

                      {/* Day Activities */}
                      {isDayExpanded && (
                        <div
                          style={{
                            padding: '14px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                          }}
                        >
                          {/* Embedded Day Map */}
                          <DayMap
                            dayNumber={dayId}
                            dayTitle={dayTitle}
                            destination={trip?.destination || itinerary?.destination || ''}
                            activities={dayActivities}
                          />

                          {/* Day Route & Directions Action Bar */}
                          {dayRouteUrl && (
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '8px',
                                paddingBottom: '6px',
                                borderBottom: '1px dashed #e9e9df',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: '#60716a',
                                  fontWeight: 500,
                                }}
                              >
                                🗺️ Day Route • {dayActivities.length}{' '}
                                {dayActivities.length === 1
                                  ? 'stop'
                                  : 'stops in sequence'}
                              </span>
                              <a
                                href={dayRouteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: '#1b5947',
                                  backgroundColor: '#eef5ee',
                                  border: '1px solid #cce2cc',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  textDecoration: 'none',
                                  transition: 'background-color 0.15s ease',
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.backgroundColor =
                                    '#dcecdc')
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.backgroundColor =
                                    '#eef5ee')
                                }
                              >
                                🗺️ Get Day Route & Directions
                              </a>
                            </div>
                          )}

                          {dayActivities && dayActivities.length > 0 ? (
                            dayActivities.map((act, actIdx) => {
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
                                  onClick={(e) => toggleActivity(actKey, e)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      toggleActivity(actKey, e)
                                    }
                                  }}
                                  style={{
                                    padding: '12px 14px',
                                    backgroundColor: '#fafaf6',
                                    borderRadius: '10px',
                                    border: '1px solid #f0f0e6',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    transition: 'background-color 0.15s ease',
                                  }}
                                >
                                  {/* Activity Header Row: Title + Toggle button */}
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: '10px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <h5
                                      style={{
                                        margin: 0,
                                        fontSize: '15px',
                                        color: '#18352f',
                                        fontWeight: 700,
                                        flex: 1,
                                      }}
                                    >
                                      {title}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={(e) => toggleActivity(actKey, e)}
                                      style={{
                                        fontSize: '12px',
                                        color: '#1b5947',
                                        fontWeight: 600,
                                        backgroundColor: '#fff',
                                        border: '1px solid #dce8dc',
                                        borderRadius: '6px',
                                        padding: '3px 10px',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                    >
                                      {isActExpanded ? 'Collapse ▲' : 'Expand ▼'}
                                    </button>
                                  </div>

                                  {/* Expanded Activity Details: time, description, category, estimated_cost */}
                                  {isActExpanded && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        paddingTop: '8px',
                                        borderTop: '1px dashed #e2e2d5',
                                        marginTop: '4px',
                                        cursor: 'default',
                                      }}
                                    >
                                      {/* Badges row: Time, Category, Estimated Cost, and View on Map */}
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        {time && (
                                          <span
                                            style={{
                                              backgroundColor: '#e9f2e8',
                                              color: '#1b5947',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              padding: '3px 8px',
                                              borderRadius: '5px',
                                            }}
                                          >
                                            🕒 {time}
                                          </span>
                                        )}

                                        {category && (
                                          <span
                                            style={{
                                              backgroundColor: '#edf2f7',
                                              color: '#4a5568',
                                              fontSize: '11px',
                                              fontWeight: 600,
                                              padding: '3px 8px',
                                              borderRadius: '5px',
                                            }}
                                          >
                                            🏷️ {category}
                                          </span>
                                        )}

                                        {cost && (
                                          <span
                                            style={{
                                              backgroundColor: '#fefcbf',
                                              color: '#744210',
                                              fontSize: '11px',
                                              fontWeight: 600,
                                              padding: '3px 8px',
                                              borderRadius: '5px',
                                            }}
                                          >
                                            💰 {cost}
                                          </span>
                                        )}

                                        {activityMapUrl && (
                                          <a
                                            href={activityMapUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              backgroundColor: '#eef5ee',
                                              color: '#1b5947',
                                              fontSize: '11px',
                                              fontWeight: 600,
                                              padding: '3px 8px',
                                              borderRadius: '5px',
                                              border: '1px solid #cce2cc',
                                              textDecoration: 'none',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              transition:
                                                'background-color 0.15s ease',
                                            }}
                                            onMouseOver={(e) =>
                                              (e.currentTarget.style.backgroundColor =
                                                '#d8ebd8')
                                            }
                                            onMouseOut={(e) =>
                                              (e.currentTarget.style.backgroundColor =
                                                '#eef5ee')
                                            }
                                          >
                                            📍 View on Map
                                          </a>
                                        )}
                                      </div>

                                      {/* Description */}
                                      {description ? (
                                        <p
                                          style={{
                                            margin: 0,
                                            fontSize: '13px',
                                            color: '#53665e',
                                            lineHeight: 1.6,
                                          }}
                                        >
                                          {description}
                                        </p>
                                      ) : (
                                        <p
                                          style={{
                                            margin: 0,
                                            fontSize: '12px',
                                            color: '#8c9e96',
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          No additional description provided.
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          ) : (
                            <p
                              style={{
                                margin: 0,
                                fontSize: '13px',
                                color: '#60716a',
                              }}
                            >
                              No activities listed for this day.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: '#60716a' }}>
                  No day plans available.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="itinerary-modal-footer"
          style={{
            flex: '0 0 auto',
            flexShrink: 0,
            padding: '14px 28px',
            borderTop: '1px solid #eef2ee',
            backgroundColor: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {itinerary && !generating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                style={{
                  backgroundColor: '#1b5947',
                  border: 'none',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: exportingPdf ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(27, 89, 71, 0.2)',
                  opacity: exportingPdf ? 0.7 : 1,
                  transition: 'background-color 0.15s ease',
                }}
                title="Download itinerary as a formatted PDF"
              >
                {exportingPdf ? '⏳ Generating PDF...' : '📄 Download PDF'}
              </button>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || exportingPdf}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #1b5947',
                  color: '#1b5947',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: generating || exportingPdf ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                🔄 Regenerate with AI
              </button>

              {pdfSuccess && (
                <span
                  style={{
                    fontSize: '12px',
                    color: '#22863a',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ✓ {pdfSuccess}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={generating || exportingPdf}
            style={{
              marginLeft: 'auto',
              padding: '9px 18px',
              backgroundColor: '#fbfaf6',
              border: '1px solid #dcdcd0',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              color: '#53665e',
              cursor: generating || exportingPdf ? 'not-allowed' : 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ItineraryModal
