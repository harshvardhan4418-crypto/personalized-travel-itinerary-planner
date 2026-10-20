import { useState } from 'react'
import { supabase } from '../services/supabase'

function CreateTrip() {
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

      setSuccess('Trip created successfully!')
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
    <section
      className="features"
      style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'left' }}
    >
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        PLAN YOUR ADVENTURE
      </p>
      <h2 style={{ textAlign: 'center', marginBottom: '28px' }}>
        Create New Trip
      </h2>

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
            htmlFor="destination"
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
            id="destination"
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
              htmlFor="startDate"
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
              id="startDate"
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
              htmlFor="endDate"
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
              id="endDate"
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
              htmlFor="groupSize"
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
              id="groupSize"
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
              htmlFor="dailyBudget"
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
              id="dailyBudget"
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
              htmlFor="currency"
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
              id="currency"
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
              htmlFor="travelStyle"
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
              id="travelStyle"
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
              htmlFor="pace"
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
              id="pace"
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

        <button
          type="submit"
          className="primary-button"
          disabled={loading}
          style={{
            marginTop: '12px',
            width: '100%',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating Trip...' : 'Create Trip'}
        </button>
      </form>
    </section>
  )
}

export default CreateTrip
