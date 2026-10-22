import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

function EditTripModal({ trip, onClose, onTripUpdated }) {
  const [destination, setDestination] = useState(trip?.destination || '')
  const [startDate, setStartDate] = useState(trip?.start_date || '')
  const [endDate, setEndDate] = useState(trip?.end_date || '')
  const [groupSize, setGroupSize] = useState(trip?.group_size ?? 1)
  const [dailyBudget, setDailyBudget] = useState(trip?.daily_budget ?? '')
  const [currency, setCurrency] = useState(trip?.currency || 'INR')
  const [travelStyle, setTravelStyle] = useState(trip?.travel_style || 'Adventure')
  const [pace, setPace] = useState(trip?.pace || 'Moderate')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (trip) {
      setDestination(trip.destination || '')
      setStartDate(trip.start_date || '')
      setEndDate(trip.end_date || '')
      setGroupSize(trip.group_size ?? 1)
      setDailyBudget(trip.daily_budget ?? '')
      setCurrency(trip.currency || 'INR')
      setTravelStyle(trip.travel_style || 'Adventure')
      setPace(trip.pace || 'Moderate')
      setError('')
      setSuccess('')
    }
  }, [trip])

  // Keyboard accessibility: Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading, onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return

    setError('')
    setSuccess('')

    // Client-side validations
    if (!destination.trim()) {
      setError('Destination is required.')
      return
    }

    if (new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be earlier than start date.')
      return
    }

    if (Number(groupSize) < 1) {
      setError('Group size must be at least 1.')
      return
    }

    if (Number(dailyBudget) < 0) {
      setError('Daily budget cannot be negative.')
      return
    }

    setLoading(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        setError('You must be logged in to edit a trip.')
        setLoading(false)
        return
      }

      const { error: updateError } = await supabase
        .from('trips')
        .update({
          destination: destination.trim(),
          start_date: startDate,
          end_date: endDate,
          group_size: Number(groupSize),
          daily_budget: Number(dailyBudget),
          currency,
          travel_style: travelStyle,
          pace,
        })
        .eq('id', trip.id)
        .eq('user_id', user.id)

      if (updateError) {
        setError(`Failed to update trip: ${updateError.message}`)
        setLoading(false)
        return
      }

      setSuccess('Trip updated successfully!')
      if (onTripUpdated) {
        await onTripUpdated()
      }
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (err) {
      setError(
        err.message || 'An unexpected error occurred while updating the trip.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="edit-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-trip-title"
    >
      <div className="edit-modal-card">
        {/* Header */}
        <div className="edit-modal-header">
          <div className="edit-modal-header-text">
            <span className="trip-form-eyebrow">UPDATE DETAILS</span>
            <h2 id="edit-trip-title">Edit Trip</h2>
          </div>
          <button
            type="button"
            className="edit-modal-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close edit modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="edit-trip-form" onSubmit={handleSubmit} className="edit-modal-body">
          {error && (
            <div className="trip-form-alert trip-form-alert-error" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="trip-form-alert trip-form-alert-success" role="status">
              <span>✅</span>
              <span>{success}</span>
            </div>
          )}

          {/* Section 1: Where & When */}
          <div className="trip-form-group-section">
            <div className="trip-form-section-heading">
              <span>📍</span>
              <span>Where &amp; When</span>
            </div>

            <div className="trip-field-group">
              <label htmlFor="edit-destination" className="trip-field-label">
                Destination <span className="trip-field-required">*</span>
              </label>
              <input
                id="edit-destination"
                type="text"
                className="trip-field-input"
                placeholder="e.g. Kyoto, Japan or Rome, Italy"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              />
            </div>

            <div className="trip-field-row-2">
              <div className="trip-field-group">
                <label htmlFor="edit-startDate" className="trip-field-label">
                  Start Date <span className="trip-field-required">*</span>
                </label>
                <input
                  id="edit-startDate"
                  type="date"
                  className="trip-field-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="trip-field-group">
                <label htmlFor="edit-endDate" className="trip-field-label">
                  End Date <span className="trip-field-required">*</span>
                </label>
                <input
                  id="edit-endDate"
                  type="date"
                  className="trip-field-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Budget & Travelers */}
          <div className="trip-form-group-section">
            <div className="trip-form-section-heading">
              <span>💰</span>
              <span>Budget &amp; Group</span>
            </div>

            <div className="trip-field-row-2">
              <div className="trip-field-group">
                <label htmlFor="edit-groupSize" className="trip-field-label">
                  Group Size <span className="trip-field-required">*</span>
                </label>
                <input
                  id="edit-groupSize"
                  type="number"
                  min="1"
                  className="trip-field-input"
                  value={groupSize}
                  onChange={(e) => setGroupSize(Number(e.target.value))}
                  required
                />
              </div>

              <div className="trip-field-row-budget">
                <div className="trip-field-group">
                  <label htmlFor="edit-dailyBudget" className="trip-field-label">
                    Daily Budget <span className="trip-field-required">*</span>
                  </label>
                  <input
                    id="edit-dailyBudget"
                    type="number"
                    min="0"
                    className="trip-field-input"
                    placeholder="e.g. 5000"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    required
                  />
                </div>

                <div className="trip-field-group">
                  <label htmlFor="edit-currency" className="trip-field-label">
                    Currency
                  </label>
                  <select
                    id="edit-currency"
                    className="trip-field-select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Preferences */}
          <div className="trip-form-group-section">
            <div className="trip-form-section-heading">
              <span>✨</span>
              <span>Travel Preferences</span>
            </div>

            <div className="trip-field-row-2">
              <div className="trip-field-group">
                <label htmlFor="edit-travelStyle" className="trip-field-label">
                  Travel Style
                </label>
                <select
                  id="edit-travelStyle"
                  className="trip-field-select"
                  value={travelStyle}
                  onChange={(e) => setTravelStyle(e.target.value)}
                >
                  <option value="Adventure">🎒 Adventure</option>
                  <option value="Relaxation">🏖️ Relaxation</option>
                  <option value="Culture">🏛️ Culture</option>
                  <option value="Nature">🌲 Nature</option>
                </select>
              </div>

              <div className="trip-field-group">
                <label htmlFor="edit-pace" className="trip-field-label">
                  Pace
                </label>
                <select
                  id="edit-pace"
                  className="trip-field-select"
                  value={pace}
                  onChange={(e) => setPace(e.target.value)}
                >
                  <option value="Relaxed">🐢 Relaxed</option>
                  <option value="Moderate">🚶 Moderate</option>
                  <option value="Fast">⚡ Fast</option>
                </select>
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer with Actions */}
        <div className="edit-modal-footer">
          <button
            type="button"
            className="edit-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-trip-form"
            className="edit-btn-save"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-dot" aria-hidden="true"></span>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditTripModal
