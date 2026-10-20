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
      }, 600)
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(24, 53, 47, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '18px',
          padding: '32px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          border: '1px solid #e9e9df',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              UPDATE DETAILS
            </p>
            <h2
              style={{
                margin: '4px 0 0',
                fontSize: '24px',
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              Edit Trip
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: '#60716a',
              padding: '4px 8px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {error && (
            <div
              style={{
                color: '#c53030',
                backgroundColor: '#fff5f5',
                border: '1px solid #feb2b2',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                color: '#22543d',
                backgroundColor: '#f0fff4',
                border: '1px solid #9ae6b4',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              {success}
            </div>
          )}

          <div>
            <label
              htmlFor="edit-destination"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Destination
            </label>
            <input
              id="edit-destination"
              type="text"
              placeholder="e.g. Goa, Paris, Tokyo"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #dcdcd0',
                fontSize: '15px',
              }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <label
                htmlFor="edit-startDate"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Start Date
              </label>
              <input
                id="edit-startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="edit-endDate"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                End Date
              </label>
              <input
                id="edit-endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <label
                htmlFor="edit-groupSize"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Group Size
              </label>
              <input
                id="edit-groupSize"
                type="number"
                min="1"
                value={groupSize}
                onChange={(e) => setGroupSize(Number(e.target.value))}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="edit-dailyBudget"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Daily Budget
              </label>
              <input
                id="edit-dailyBudget"
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <label
                htmlFor="edit-currency"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Currency
              </label>
              <select
                id="edit-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                  background: '#fff',
                }}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-travelStyle"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Travel Style
              </label>
              <select
                id="edit-travelStyle"
                value={travelStyle}
                onChange={(e) => setTravelStyle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                  background: '#fff',
                }}
              >
                <option value="Adventure">Adventure</option>
                <option value="Relaxation">Relaxation</option>
                <option value="Culture">Culture</option>
                <option value="Nature">Nature</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-pace"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Pace
              </label>
              <select
                id="edit-pace"
                value={pace}
                onChange={(e) => setPace(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #dcdcd0',
                  fontSize: '15px',
                  background: '#fff',
                }}
              >
                <option value="Relaxed">Relaxed</option>
                <option value="Moderate">Moderate</option>
                <option value="Fast">Fast</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
            <button
              type="submit"
              className="primary-button"
              disabled={loading}
              style={{
                flex: 1,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: '13px 21px',
                backgroundColor: '#fbfaf6',
                border: '1px solid #dcdcd0',
                borderRadius: '9px',
                fontWeight: 700,
                color: '#53665e',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditTripModal
