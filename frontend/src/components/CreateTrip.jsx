import { useState } from 'react'
import { supabase } from '../services/supabase'

function CreateTrip({ onTripCreated }) {
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupSize, setGroupSize] = useState(1)
  const [dailyBudget, setDailyBudget] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [travelStyle, setTravelStyle] = useState('Adventure')
  const [pace, setPace] = useState('Moderate')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return

    setError('')
    setSuccess('')

    // Client-side validations
    if (!destination.trim()) {
      setError('Please provide a destination for your trip.')
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
        setError('You must be logged in to create a trip.')
        setLoading(false)
        return
      }

      const { error: insertError } = await supabase.from('trips').insert([
        {
          destination: destination.trim(),
          start_date: startDate,
          end_date: endDate,
          group_size: Number(groupSize),
          daily_budget: Number(dailyBudget),
          currency,
          travel_style: travelStyle,
          pace,
          user_id: user.id,
        },
      ])

      if (insertError) {
        setError(`Failed to create trip: ${insertError.message}`)
        setLoading(false)
        return
      }

      setSuccess('Trip created successfully! It is now saved in Your Journeys.')
      if (onTripCreated) {
        onTripCreated()
      }

      // Reset form fields
      setDestination('')
      setStartDate('')
      setEndDate('')
      setGroupSize(1)
      setDailyBudget('')
      setCurrency('INR')
      setTravelStyle('Adventure')
      setPace('Moderate')
    } catch (err) {
      setError(
        err.message || 'An unexpected error occurred while saving the trip.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="trip-form-section-container">
      <div className="trip-form-card">
        {/* Header */}
        <div className="trip-form-header">
          <span className="trip-form-eyebrow">PLAN YOUR ADVENTURE</span>
          <h2 className="trip-form-title">Create New Trip</h2>
          <p className="trip-form-subtitle">
            Enter your destination and travel preferences to generate a tailored itinerary.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="trip-form-body">
          {/* Feedback Alerts */}
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
              <label htmlFor="destination" className="trip-field-label">
                Destination <span className="trip-field-required">*</span>
              </label>
              <input
                id="destination"
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
                <label htmlFor="startDate" className="trip-field-label">
                  Start Date <span className="trip-field-required">*</span>
                </label>
                <input
                  id="startDate"
                  type="date"
                  className="trip-field-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="trip-field-group">
                <label htmlFor="endDate" className="trip-field-label">
                  End Date <span className="trip-field-required">*</span>
                </label>
                <input
                  id="endDate"
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
                <label htmlFor="groupSize" className="trip-field-label">
                  Group Size <span className="trip-field-required">*</span>
                </label>
                <input
                  id="groupSize"
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
                  <label htmlFor="dailyBudget" className="trip-field-label">
                    Daily Budget <span className="trip-field-required">*</span>
                  </label>
                  <input
                    id="dailyBudget"
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
                  <label htmlFor="currency" className="trip-field-label">
                    Currency
                  </label>
                  <select
                    id="currency"
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
                <label htmlFor="travelStyle" className="trip-field-label">
                  Travel Style
                </label>
                <select
                  id="travelStyle"
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
                <label htmlFor="pace" className="trip-field-label">
                  Pace
                </label>
                <select
                  id="pace"
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

          {/* Primary Submit Button */}
          <button
            type="submit"
            className="trip-form-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-dot" aria-hidden="true"></span>
                <span>Creating Trip...</span>
              </>
            ) : (
              <span>✨ Create Trip</span>
            )}
          </button>
        </form>
      </div>
    </section>
  )
}

export default CreateTrip
