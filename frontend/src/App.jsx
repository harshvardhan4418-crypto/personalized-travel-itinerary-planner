import { useState, useEffect } from 'react'
import { checkBackendHealth } from './services/api'
import './App.css'
import { supabase } from './services/supabase'
import CreateTrip from './components/CreateTrip'
import EditTripModal from './components/EditTripModal'
import ItineraryModal from './components/ItineraryModal'
import AuthModal from './components/AuthModal'

// CSS gradients for destination cards (consistent, zero external asset dependencies)
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #1b5947 0%, #2e7d62 100%)', // Forest Emerald
  'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', // Deep Ocean
  'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)', // Sea Teal
  'linear-gradient(135deg, #854d0e 0%, #d97706 100%)', // Warm Amber
  'linear-gradient(135deg, #475569 0%, #64748b 100%)', // Mountain Slate
  'linear-gradient(135deg, #581c87 0%, #9333ea 100%)', // Twilight Violet
]

function getCardGradient(str) {
  if (!str) return CARD_GRADIENTS[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % CARD_GRADIENTS.length
  return CARD_GRADIENTS[idx]
}

function formatTripDates(startDate, endDate) {
  if (!startDate && !endDate) return null
  if (startDate && !endDate) return startDate
  if (!startDate && endDate) return `Until ${endDate}`
  return `${startDate} → ${endDate}`
}

function calculateTripDuration(startDate, endDate) {
  if (!startDate || !endDate) return null
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diff = end - start
    if (isNaN(diff) || diff < 0) return null
    const days = Math.round(diff / (1000 * 60 * 60 * 24)) + 1
    return days === 1 ? '1 Day' : `${days} Days`
  } catch {
    return null
  }
}

async function loadTrips(setTrips, setLoading, setError) {
  if (typeof setLoading === 'function') setLoading(true)
  if (typeof setError === 'function') setError(null)
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load trips:', error.message)
      if (typeof setError === 'function') setError(error.message)
      alert(error.message)
      return
    }

    console.log('Trips from Supabase:', data)
    setTrips(data || [])
  } catch (error) {
    console.error('Failed to load trips:', error)
    if (typeof setError === 'function') {
      setError(error?.message || 'Failed to load trips.')
    }
    alert('Trips load nahi hui. Console mein error check karein.')
  } finally {
    if (typeof setLoading === 'function') setLoading(false)
  }
}

function App() {
  const [backendStatus, setBackendStatus] = useState('Not checked')
  const [trips, setTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsError, setTripsError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [editingTrip, setEditingTrip] = useState(null)
  const [activeItineraryTrip, setActiveItineraryTrip] = useState(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState('login')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Keyboard accessibility: Escape key closes mobile navigation menu
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileMenuOpen])

  useEffect(() => {
    async function loadUserTrips() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session) {
        setSession(session)
        await loadTrips(setTrips, setTripsLoading, setTripsError)
      } else {
        setSession(null)
        setTrips([])
      }
    }

    loadUserTrips()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)

      if (session) {
        loadTrips(setTrips, setTripsLoading, setTripsError)
      } else {
        setTrips([])
      }
    })

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
    setSession(null)
    setMobileMenuOpen(false)
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
      } = await supabase.auth.getUser()

      if (!user) {
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

      await loadTrips(setTrips, setTripsLoading, setTripsError)
    } catch (err) {
      console.error('Error deleting trip:', err)
      alert(`Error deleting trip: ${err.message || 'An unexpected error occurred.'}`)
    } finally {
      setDeletingId(null)
    }
  }

  // Smooth scroll & focus destination input on empty state CTA
  const handlePlanFirstTrip = () => {
    const createSec = document.getElementById('create-trip')
    if (createSec) {
      createSec.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => {
        const destInput = document.getElementById('destination')
        if (destInput) destInput.focus()
      }, 400)
    }
  }

  // Filter and sort trips (pure, non-mutating)
  const filteredTrips = trips.filter((trip) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const dest = (trip.destination || '').toLowerCase()
    return dest.includes(q)
  })

  const sortedTrips = [...filteredTrips].sort((a, b) => {
    if (sortBy === 'newest') {
      const dateA = a.created_at || a.start_date || ''
      const dateB = b.created_at || b.start_date || ''
      return dateB.localeCompare(dateA)
    }
    if (sortBy === 'oldest') {
      const dateA = a.created_at || a.start_date || ''
      const dateB = b.created_at || b.start_date || ''
      return dateA.localeCompare(dateB)
    }
    if (sortBy === 'name-asc') {
      return (a.destination || '').localeCompare(b.destination || '')
    }
    if (sortBy === 'name-desc') {
      return (b.destination || '').localeCompare(a.destination || '')
    }
    return 0
  })

  return (
    <div className="app">
      {/* Modern Sticky Navbar */}
      <header className="navbar">
        <a href="#home" className="navbar-brand-link" onClick={() => setMobileMenuOpen(false)}>
          <span className="navbar-compass-badge" aria-hidden="true">
            🧭
          </span>
          <h2>TravelMate</h2>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="navbar-nav" aria-label="Main Navigation">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          {session && <a href="#my-trips">My Trips</a>}
          <a href="#about">About</a>
        </nav>

        {/* Right-Side Actions (Guest vs Authenticated) */}
        <div className="navbar-actions">
          {!session ? (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setAuthModalMode('login')
                  setAuthModalOpen(true)
                  setMobileMenuOpen(false)
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setAuthModalMode('signup')
                  setAuthModalOpen(true)
                  setMobileMenuOpen(false)
                }}
              >
                Get Started
              </button>
            </>
          ) : (
            <>
              <a
                href="#create-trip"
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                + New Trip
              </a>
              <div
                className="navbar-user-chip"
                title={session.user?.email || 'Authenticated User'}
              >
                <span className="user-avatar-circle" aria-hidden="true">
                  {session.user?.email ? session.user.email[0].toUpperCase() : 'U'}
                </span>
                <span className="user-email-text">
                  {session.user?.email || 'Account'}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleLogout}
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                Sign Out
              </button>
            </>
          )}

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            className="navbar-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-drawer open" role="region" aria-label="Mobile Navigation">
          <a href="#home" onClick={() => setMobileMenuOpen(false)}>
            Home
          </a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>
            Features
          </a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>
            How It Works
          </a>
          {session && (
            <a href="#my-trips" onClick={() => setMobileMenuOpen(false)}>
              My Trips
            </a>
          )}
          <a href="#about" onClick={() => setMobileMenuOpen(false)}>
            About
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            {!session ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setAuthModalMode('login')
                    setAuthModalOpen(true)
                    setMobileMenuOpen(false)
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setAuthModalMode('signup')
                    setAuthModalOpen(true)
                    setMobileMenuOpen(false)
                  }}
                >
                  Get Started
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                  <span className="user-avatar-circle">
                    {session.user?.email ? session.user.email[0].toUpperCase() : 'U'}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>{session.user?.email}</span>
                </div>
                <a
                  href="#create-trip"
                  className="btn-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  + New Trip
                </a>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleLogout()
                  }}
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Authentication Dialog Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(newSession) => {
          setSession(newSession)
          loadTrips(setTrips, setTripsLoading, setTripsError)
        }}
      />

      {/* Hero Section */}
      <main id="home" className="hero-v2">
        <div className="hero-content">
          <div className="hero-badge-pill">
            <span>✨</span>
            <span>AI-Powered Travel Assistant</span>
          </div>

          <h1>
            Design Your Dream Journey <br />
            <span className="hero-gradient-text">in Seconds.</span>
          </h1>

          <p className="hero-description">
            Generate tailored day-by-day travel schedules with verified attraction locations,
            interactive Leaflet routes, budget tracking, and offline PDF exports.
          </p>

          <div className="hero-actions-group">
            {session ? (
              <a
                href="#create-trip"
                className="btn-primary"
                style={{ padding: '13px 26px', fontSize: '15px' }}
              >
                ✨ Plan a New Trip
              </a>
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '13px 26px', fontSize: '15px' }}
                onClick={() => {
                  setAuthModalMode('signup')
                  setAuthModalOpen(true)
                }}
              >
                Start Planning Free
              </button>
            )}

            <a
              href="#features"
              className="btn-secondary"
              style={{ padding: '12px 22px', fontSize: '14.5px' }}
            >
              Explore Features ↓
            </a>
          </div>

          <div className="hero-trust-indicators">
            <div className="hero-trust-item">
              <span>⚡</span>
              <span>Instant Groq AI Plans</span>
            </div>
            <div className="hero-trust-item">
              <span>📍</span>
              <span>Verified Map Coordinates</span>
            </div>
            <div className="hero-trust-item">
              <span>📄</span>
              <span>Vector PDF Export</span>
            </div>
          </div>
        </div>

        {/* Interactive Itinerary Preview Card (Demo Data) */}
        <div className="itinerary-preview-container">
          <div className="itinerary-preview-card">
            <div className="preview-card-header">
              <div>
                <h3 className="preview-dest-title">Kyoto, Japan</h3>
                <p className="preview-dest-meta">3 Days • Cultural Exploration • Moderate Pace</p>
              </div>
              <span className="preview-demo-tag">Sample Preview</span>
            </div>

            <div className="preview-stops-list">
              <div className="preview-stop-item">
                <span className="preview-stop-number">1</span>
                <div className="preview-stop-content">
                  <p className="preview-stop-name">Fushimi Inari-taisha</p>
                  <p className="preview-stop-time">08:30 AM – 11:00 AM</p>
                </div>
                <span className="preview-stop-cost">Free</span>
              </div>

              <div className="preview-stop-item">
                <span className="preview-stop-number">2</span>
                <div className="preview-stop-content">
                  <p className="preview-stop-name">Kiyomizu-dera Temple</p>
                  <p className="preview-stop-time">01:30 PM – 04:00 PM</p>
                </div>
                <span className="preview-stop-cost">¥400</span>
              </div>

              <div className="preview-stop-item">
                <span className="preview-stop-number">3</span>
                <div className="preview-stop-content">
                  <p className="preview-stop-name">Gion Historic District</p>
                  <p className="preview-stop-time">05:30 PM – 07:30 PM</p>
                </div>
                <span className="preview-stop-cost">Free</span>
              </div>
            </div>

            <div className="preview-budget-box">
              <div className="preview-budget-labels">
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Daily Budget</span>
                <span style={{ fontWeight: 700, color: 'var(--color-accent-emerald)' }}>¥2,400 / ¥12,000</span>
              </div>
              <div className="preview-budget-track">
                <div className="preview-budget-bar"></div>
              </div>
            </div>

            <div className="preview-features-badge-row">
              <span className="preview-feature-chip">🗺️ Interactive Pins</span>
              <span className="preview-feature-chip">🧭 Live Directions</span>
              <span className="preview-feature-chip">📄 PDF Ready</span>
            </div>
          </div>
        </div>
      </main>

      {/* Developer API & Backend Health Diagnostics */}
      <section className="backend-test" style={{ padding: '24px 8%', background: '#fafaf8' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            System Diagnostics:
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={testBackend}
            style={{ padding: '6px 14px', fontSize: '12.5px' }}
          >
            Test API Health
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadTrips(setTrips, setTripsLoading, setTripsError)}
            style={{ padding: '6px 14px', fontSize: '12.5px' }}
          >
            Refresh Trips
          </button>
          <span
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: backendStatus === 'ok' ? 'var(--color-accent-emerald-bg)' : 'var(--color-bg-subtle)',
              color: backendStatus === 'ok' ? 'var(--color-accent-emerald)' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            Status: {backendStatus}
          </span>
        </div>
      </section>

      {/* Authenticated User Workspace */}
      {session && (
        <>
          <div id="create-trip">
            <CreateTrip onTripCreated={() => loadTrips(setTrips, setTripsLoading, setTripsError)} />
          </div>

          {/* Phase 4: My Trips Dashboard & Destination Cards */}
          <section id="my-trips" className="dashboard-section">
            <div className="dashboard-container">
              {/* Header */}
              <div className="dashboard-header">
                <div className="dashboard-header-top">
                  <div className="dashboard-title-group">
                    <h2>Your Journeys</h2>
                    <span className="dashboard-badge-counter">
                      ✨ {trips.length} {trips.length === 1 ? 'Trip Saved' : 'Trips Saved'}
                    </span>
                  </div>
                  <a href="#create-trip" className="btn-primary" style={{ padding: '8px 16px', fontSize: '13.5px' }}>
                    + Plan New Trip
                  </a>
                </div>
                <p className="dashboard-subtitle">
                  Manage, explore, and customize your personalized itineraries in one place.
                </p>
              </div>

              {/* Error Banner */}
              {tripsError && (
                <div className="dashboard-error-banner" role="alert">
                  <span>⚠️ {tripsError}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => loadTrips(setTrips, setTripsLoading, setTripsError)}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Loading State */}
              {tripsLoading && (
                <div className="dashboard-loading-box">
                  <div className="dashboard-spinner" aria-hidden="true"></div>
                  <p>Loading your journeys...</p>
                </div>
              )}

              {/* Empty State: No Trips at all */}
              {!tripsLoading && trips.length === 0 && (
                <div className="dashboard-empty-card">
                  <div className="dashboard-empty-icon" aria-hidden="true">
                    🧭
                  </div>
                  <h3>No journeys planned yet</h3>
                  <p>
                    You haven't saved any trips yet. Create your first journey above to unlock
                    AI itineraries, interactive route maps, and budget tracking!
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handlePlanFirstTrip}
                    style={{ padding: '12px 24px', fontSize: '14.5px' }}
                  >
                    ✨ Plan Your First Trip
                  </button>
                </div>
              )}

              {/* Search, Filter Toolbar & Card Grid */}
              {!tripsLoading && trips.length > 0 && (
                <>
                  <div className="dashboard-toolbar">
                    <div className="dashboard-search-wrapper">
                      <span className="dashboard-search-icon" aria-hidden="true">
                        🔍
                      </span>
                      <input
                        type="text"
                        className="dashboard-search-input"
                        placeholder="Search by destination..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search destinations"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          className="dashboard-search-clear"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="dashboard-filter-group">
                      <div className="dashboard-sort-wrapper">
                        <label htmlFor="dashboard-sort">Sort by:</label>
                        <select
                          id="dashboard-sort"
                          className="dashboard-sort-select"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                        >
                          <option value="newest">Newest First</option>
                          <option value="oldest">Oldest First</option>
                          <option value="name-asc">Destination (A–Z)</option>
                          <option value="name-desc">Destination (Z–A)</option>
                        </select>
                      </div>

                      {searchQuery && (
                        <span
                          style={{
                            fontSize: '13px',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 600,
                          }}
                        >
                          Showing {sortedTrips.length} of {trips.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Empty Search State */}
                  {sortedTrips.length === 0 ? (
                    <div className="dashboard-empty-card" style={{ padding: '40px 20px' }}>
                      <div className="dashboard-empty-icon" aria-hidden="true">
                        🔍
                      </div>
                      <h3>No destinations matching &ldquo;{searchQuery}&rdquo;</h3>
                      <p>We couldn't find any trips for that search term. Try searching for another city or country.</p>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setSearchQuery('')}
                        style={{ padding: '8px 18px', fontSize: '13.5px' }}
                      >
                        Clear Search
                      </button>
                    </div>
                  ) : (
                    /* Destination Cards Grid */
                    <div className="journey-cards-grid">
                      {sortedTrips.map((trip, index) => {
                        const durationText = calculateTripDuration(trip.start_date, trip.end_date)
                        const datesText = formatTripDates(trip.start_date, trip.end_date)
                        const cardGrad = getCardGradient(trip.destination)

                        return (
                          <article className="journey-card" key={trip.id ?? index}>
                            {/* CSS Gradient Banner Visual */}
                            <div className="journey-card-banner" style={{ background: cardGrad }}>
                              <span className="journey-card-tag">📍 Destination</span>
                              {durationText && (
                                <span className="journey-card-duration-badge">
                                  🗓️ {durationText}
                                </span>
                              )}
                              <span className="journey-card-banner-icon" aria-hidden="true">
                                🧭
                              </span>
                            </div>

                            {/* Card Body */}
                            <div className="journey-card-body">
                              <h3 className="journey-card-destination">
                                {trip.destination || 'Untitled Journey'}
                              </h3>

                              <div className="journey-card-details">
                                {datesText && (
                                  <div className="journey-detail-row">
                                    <span className="journey-detail-icon" aria-hidden="true">
                                      🗓️
                                    </span>
                                    <span>{datesText}</span>
                                  </div>
                                )}

                                {trip.group_size !== null &&
                                  trip.group_size !== undefined &&
                                  trip.group_size !== '' && (
                                    <div className="journey-detail-row">
                                      <span className="journey-detail-icon" aria-hidden="true">
                                        👥
                                      </span>
                                      <span>
                                        {trip.group_size}{' '}
                                        {Number(trip.group_size) === 1
                                          ? 'Traveler'
                                          : 'Travelers'}
                                      </span>
                                    </div>
                                  )}

                                <div className="journey-badges-wrap">
                                  {trip.daily_budget !== null &&
                                    trip.daily_budget !== undefined &&
                                    trip.daily_budget !== '' && (
                                      <span className="journey-chip journey-chip-budget">
                                        💰 {trip.currency ? `${trip.currency} ` : ''}
                                        {Number(trip.daily_budget).toLocaleString()} / day
                                      </span>
                                    )}

                                  {trip.travel_style && (
                                    <span className="journey-chip">
                                      🎒 {trip.travel_style}
                                    </span>
                                  )}

                                  {trip.pace && (
                                    <span className="journey-chip">
                                      ⚡ {trip.pace} Pace
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Card Actions */}
                              <div className="journey-card-actions">
                                <button
                                  type="button"
                                  className="journey-btn-itinerary"
                                  onClick={() => setActiveItineraryTrip(trip)}
                                  aria-label={`View itinerary for ${trip.destination || 'trip'}`}
                                >
                                  ✨ View Itinerary
                                </button>

                                <div className="journey-secondary-actions">
                                  <button
                                    type="button"
                                    className="journey-btn-edit"
                                    onClick={() => setEditingTrip(trip)}
                                    aria-label={`Edit trip details for ${trip.destination || 'trip'}`}
                                  >
                                    ✏️ Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="journey-btn-delete"
                                    onClick={() => handleDeleteTrip(trip.id)}
                                    disabled={deletingId === trip.id}
                                    aria-label={`Delete trip to ${trip.destination || 'trip'}`}
                                  >
                                    {deletingId === trip.id ? 'Deleting...' : '🗑️ Delete'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {editingTrip && (
            <EditTripModal
              trip={editingTrip}
              onClose={() => setEditingTrip(null)}
              onTripUpdated={() => loadTrips(setTrips, setTripsLoading, setTripsError)}
            />
          )}

          {activeItineraryTrip && (
            <ItineraryModal
              trip={activeItineraryTrip}
              onClose={() => setActiveItineraryTrip(null)}
              onItineraryUpdated={() => loadTrips(setTrips, setTripsLoading, setTripsError)}
            />
          )}
        </>
      )}

      {/* Feature Highlights Section (4 Pillars) */}
      <section id="features" className="saas-section" style={{ background: 'var(--color-bg-canvas)' }}>
        <div className="app-container">
          <div className="saas-section-header">
            <span className="eyebrow">INTELLIGENT TRAVEL SUITE</span>
            <h2>Everything you need for effortless travel</h2>
            <p>
              From automated daily schedules to precise interactive map pins and budget management,
              TravelMate gives you complete control over your journeys.
            </p>
          </div>

          <div className="features-grid-4">
            <article className="saas-feature-card">
              <div className="saas-feature-icon-wrapper" aria-hidden="true">
                ✨
              </div>
              <h3>AI-Generated Day Plans</h3>
              <p>
                Custom schedules powered by Groq AI tailored to your travel style, pace, dates, and group size with realistic time windows.
              </p>
            </article>

            <article className="saas-feature-card">
              <div className="saas-feature-icon-wrapper" aria-hidden="true">
                🗺️
              </div>
              <h3>Interactive Leaflet Maps</h3>
              <p>
                Verified coordinates fetched from OpenStreetMap Nominatim with numbered pins, attraction popups, and turn-by-turn directions.
              </p>
            </article>

            <article className="saas-feature-card">
              <div className="saas-feature-icon-wrapper" aria-hidden="true">
                💰
              </div>
              <h3>Smart Budget Tracker</h3>
              <p>
                Track estimated expenses against your planned daily budget with automatic currency parsing and day-wise badges.
              </p>
            </article>

            <article className="saas-feature-card">
              <div className="saas-feature-icon-wrapper" aria-hidden="true">
                📄
              </div>
              <h3>One-Click PDF Export</h3>
              <p>
                Download multi-page vector PDF documents complete with full daily schedules, locations, and budget tables for offline travel.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* How It Works Section (3 Simple Steps) */}
      <section id="how-it-works" className="how-it-works-section">
        <div className="app-container">
          <div className="saas-section-header">
            <span className="eyebrow">SIMPLE 3-STEP PROCESS</span>
            <h2>How TravelMate Works</h2>
            <p>
              Turn a destination idea into an actionable, stress-free travel itinerary in seconds.
            </p>
          </div>

          <div className="how-it-works-grid">
            <div className="how-step-card">
              <div className="how-step-number">01</div>
              <h3>Set Your Parameters</h3>
              <p>
                Enter your destination, dates, travel style, pace, and daily budget in any international currency.
              </p>
            </div>

            <div className="how-step-card">
              <div className="how-step-number">02</div>
              <h3>Generate with AI</h3>
              <p>
                Our Groq AI engine drafts an optimized day-by-day itinerary with timings, curated attractions, and cost breakdowns.
              </p>
            </div>

            <div className="how-step-card">
              <div className="how-step-number">03</div>
              <h3>Explore & Export</h3>
              <p>
                Preview numbered stops on Leaflet maps, launch Google Maps navigation, and download your itinerary as a formatted PDF.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer id="about">
        <p>TravelMate — Your Personalized Travel Itinerary Planner</p>
      </footer>
    </div>
  )
}

export default App
