
import { useState, useEffect } from 'react'
import { checkBackendHealth, getTrips } from './services/api'
import './App.css'
import { supabase } from './services/supabase'
import CreateTrip from './components/CreateTrip'
import EditTripModal from './components/EditTripModal'
import ItineraryModal from './components/ItineraryModal'



async function loadTrips(setTrips) {
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load trips:', error.message)
      alert(error.message)
      return
    }

    console.log('Trips from Supabase:', data)
    setTrips(data || [])
  } catch (error) {
    console.error('Failed to load trips:', error)
    alert('Trips load nahi hui. Console mein error check karein.')
  }
}


function App() {
  const [backendStatus, setBackendStatus] = useState('Not checked')
  const [trips, setTrips] = useState([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [editingTrip, setEditingTrip] = useState(null)
  const [activeItineraryTrip, setActiveItineraryTrip] = useState(null)
  
useEffect(() => {
  async function loadUserTrips() {
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
  setSession(session)
  await loadTrips(setTrips)
} else {
  setSession(null)
  setTrips([])
}
  }

  loadUserTrips()

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
  setSession(session)

  if (session) {
    loadTrips(setTrips)
  } else {
    setTrips([])
  }
}
  )

  return () => {
    subscription.unsubscribe()
  }
}, [])

  
async function handleSignup() {
  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    alert(error.message)
    return
  }

  alert('Signup request successful! Check your email if confirmation is required.')
}


async function handleLogin() {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    alert(error.message)
    return
  }

  alert('Login successful!')
}

  
async function handleLogout() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    alert(error.message)
    return
  }

  setTrips([])
  alert('Logout successful!')
}


async function testBackend() {
  try {
    console.log('Test Backend button clicked')
    const data = await checkBackendHealth()
    setBackendStatus(data.status)
  } catch (error) {
    console.error('Backend connection error:', error)
    setBackendStatus(`Connection failed: ${error.message}`)
  }
}

async function handleDeleteTrip(tripId) {
  if (!tripId) {
    alert('Cannot delete trip: Trip ID is missing.')
    return
  }

  const confirmed = window.confirm('Are you sure you want to delete this trip?')
  if (!confirmed) return

  setDeletingId(tripId)

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      alert('You must be logged in to delete a trip.')
      setDeletingId(null)
      return
    }

    const { error: deleteError } = await supabase
      .from('trips')
      .delete()
      .eq('id', tripId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Failed to delete trip:', deleteError.message)
      alert(`Failed to delete trip: ${deleteError.message}`)
      setDeletingId(null)
      return
    }

    await loadTrips(setTrips)
  } catch (err) {
    console.error('Error deleting trip:', err)
    alert(
      `Error deleting trip: ${err.message || 'An unexpected error occurred.'}`
    )
  } finally {
    setDeletingId(null)
  }
}




  return (
    <div className="app">
      
<section className="features">
  <h2>Create Account</h2>

  <input
    type="email"
    placeholder="Enter your email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />

  <input
    type="password"
    placeholder="Create password (minimum 6 characters)"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />

  <button className="primary-button" onClick={handleSignup}>
    Sign Up
  </button>
  
<button className="primary-button" onClick={handleLogin}>
  Log In
</button>

<button className="primary-button" onClick={handleLogout}>
  Log Out
</button>


</section>

      <header className="navbar">
        <h2>TravelMate</h2>
        <nav>
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
        </nav>
        <button className="login-button">Get Started</button>
      </header>

      <main id="home" className="hero">
        <div className="hero-content">
          <p className="eyebrow">YOUR JOURNEY, YOUR WAY</p>
          <h1>Discover the world.<br />We'll plan the journey.</h1>
          <p className="description">
            Create personalized travel itineraries based on your destination,
            budget, interests, and travel style.
          </p>
          
<button
  className="primary-button"
  onClick={() => loadTrips(setTrips)}
>
  Load Trips
</button>

        </div>
        <div className="hero-card">
          <span className="card-icon">✈️</span>
          <h3>Your next adventure starts here</h3>
          <p>Personalized plans. Memorable experiences.</p>
        </div>
      </main>
      
      
<section className="backend-test">
  <h2>Backend Connection</h2>

  <button className="primary-button" onClick={testBackend}>
    Test Backend
  </button>

 <button
  className="primary-button"
  onClick={() => loadTrips(setTrips)}
>
  Load Trips
</button>

  <p>Status: {backendStatus}</p>
</section>


{session && (
  <>
    <CreateTrip />

    <section className="features">
      <p className="eyebrow">YOUR SAVED TRIPS</p>
      <h2>My Trips</h2>

  {trips.length === 0 ? (
    <p>No trips found. Your saved trips will appear here.</p>
  ) : (
    <div className="feature-grid">
      
{trips.map((trip, index) => (
  <article className="feature-card" key={trip.id ?? index}>
    <h3>{trip.destination ?? 'Untitled Trip'}</h3>

    <p>Trip ID: {trip.id ?? 'Not available'}</p>

    <p>
      <strong>Start Date:</strong>{' '}
      {trip.start_date ?? 'Not set'}
    </p>

    <p>
      <strong>End Date:</strong>{' '}
      {trip.end_date ?? 'Not set'}
    </p>

    <p>
      <strong>Group Size:</strong>{' '}
      {trip.group_size ?? 'Not set'}
    </p>

    <p>
      <strong>Daily Budget:</strong>{' '}
      {trip.daily_budget ?? 'Not set'} {trip.currency ?? ''}
    </p>

    <p>
      <strong>Travel Style:</strong>{' '}
      {trip.travel_style ?? 'Not set'}
    </p>

    <p>
      <strong>Pace:</strong>{' '}
      {trip.pace ?? 'Not set'}
    </p>

    <button
      className="primary-button"
      onClick={() => setActiveItineraryTrip(trip)}
      style={{
        marginTop: '16px',
        width: '100%',
        padding: '10px 14px',
        backgroundColor: '#1b5947',
        color: '#fff',
        borderRadius: '8px',
        fontWeight: 700,
        fontSize: '13px',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}
    >
      ✨ AI Itinerary
    </button>

    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
      <button
        className="primary-button"
        onClick={() => setEditingTrip(trip)}
        style={{
          flex: 1,
          padding: '8px 12px',
          fontSize: '13px',
          borderRadius: '8px',
          fontWeight: 600,
          textAlign: 'center',
          backgroundColor: '#fbfaf6',
          color: '#18352f',
          border: '1px solid #dcdcd0',
        }}
      >
        Edit Trip
      </button>

      <button
        className="delete-button"
        onClick={() => handleDeleteTrip(trip.id)}
        disabled={deletingId === trip.id}
        style={{
          flex: 1,
          padding: '8px 12px',
          backgroundColor: '#fff',
          color: '#c53030',
          border: '1px solid #feb2b2',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '13px',
          cursor: deletingId === trip.id ? 'not-allowed' : 'pointer',
          opacity: deletingId === trip.id ? 0.6 : 1,
          transition: 'all 0.2s ease',
        }}
        onMouseOver={(e) => {
          if (deletingId !== trip.id) {
            e.currentTarget.style.backgroundColor = '#fff5f5'
            e.currentTarget.style.borderColor = '#c53030'
          }
        }}
        onMouseOut={(e) => {
          if (deletingId !== trip.id) {
            e.currentTarget.style.backgroundColor = '#fff'
            e.currentTarget.style.borderColor = '#feb2b2'
          }
        }}
      >
        {deletingId === trip.id ? 'Deleting...' : 'Delete Trip'}
      </button>
    </div>
  </article>
))}

    </div>
  )}
</section>

    {editingTrip && (
      <EditTripModal
        trip={editingTrip}
        onClose={() => setEditingTrip(null)}
        onTripUpdated={() => loadTrips(setTrips)}
      />
    )}

    {activeItineraryTrip && (
      <ItineraryModal
        trip={activeItineraryTrip}
        onClose={() => setActiveItineraryTrip(null)}
        onItineraryUpdated={() => loadTrips(setTrips)}
      />
    )}
  </>
)}

      <section id="features" className="features">
        <p className="eyebrow">TRAVEL SMARTER</p>
        <h2>Everything you need to plan your trip</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <span>🧭</span>
            <h3>Personalized Recommendations</h3>
            <p>Discover destinations and places that match your interests.</p>
          </article>
          <article className="feature-card">
            <span>🗓️</span>
            <h3>Daily Itineraries</h3>
            <p>Organize your trip into a practical day-by-day plan.</p>
          </article>
          <article className="feature-card">
            <span>💰</span>
            <h3>Budget Friendly</h3>
            <p>Plan your experiences around your travel budget.</p>
          </article>
        </div>
      </section>

      <footer id="about">
        <p>TravelMate — Your Personalized Travel Itinerary Planner</p>
      </footer>
    </div>
  )
}

export default App
