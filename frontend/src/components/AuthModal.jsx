import { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'

function AuthModal({ isOpen, initialMode = 'login', onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode) // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const emailInputRef = useRef(null)

  // Reset form when modal opens or initialMode changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setError('')
      setSuccess('')
      setTimeout(() => {
        emailInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen, initialMode])

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, loading, onClose])

  if (!isOpen) return null

  const handleTabSwitch = (newMode) => {
    if (loading) return
    setMode(newMode)
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return

    setError('')
    setSuccess('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Please enter a valid email address.')
      return
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match. Please verify your password.')
      return
    }

    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        })

        if (signupError) {
          setError(signupError.message)
          setLoading(false)
          return
        }

        if (data?.session) {
          setSuccess('Account created and logged in successfully!')
          if (onSuccess) onSuccess(data.session)
          setTimeout(() => onClose(), 1000)
        } else {
          setSuccess(
            'Registration successful! Please check your email for a confirmation link before logging in.'
          )
        }
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })

        if (loginError) {
          setError(loginError.message)
          setLoading(false)
          return
        }

        setSuccess('Welcome back! Logging you in...')
        if (onSuccess) onSuccess(data.session)
        setTimeout(() => onClose(), 600)
      }
    } catch (err) {
      setError(err.message || 'An unexpected authentication error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-brand-badge">
            <span className="auth-compass-icon">🧭</span>
            <span>TravelMate Account</span>
          </div>
          <button
            type="button"
            className="auth-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs-container">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('login')}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('signup')}
            disabled={loading}
          >
            Create Account
          </button>
        </div>

        {/* Title & Subtitle */}
        <div className="auth-modal-intro">
          <h2 id="auth-modal-title">
            {mode === 'login' ? 'Welcome Back' : 'Start Your Adventure'}
          </h2>
          <p>
            {mode === 'login'
              ? 'Access your personalized itineraries and saved trips.'
              : 'Join TravelMate to build AI itineraries with interactive maps & budget tools.'}
          </p>
        </div>

        {/* Feedback Banners */}
        {error && (
          <div className="auth-banner auth-banner-error" role="alert">
            <span className="auth-banner-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="auth-banner auth-banner-success" role="status">
            <span className="auth-banner-icon">✓</span>
            <span>{success}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-header">
              <label htmlFor="auth-password">Password</label>
              <span className="auth-hint">Min. 6 characters</span>
            </div>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="auth-field animate-fade-in">
              <label htmlFor="auth-confirm-password">Confirm Password</label>
              <input
                id="auth-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-spinner">
                <span className="spinner-dot"></span>
                {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
              </span>
            ) : mode === 'login' ? (
              'Sign In to TravelMate'
            ) : (
              'Create My Free Account'
            )}
          </button>
        </form>

        {/* Footer switch */}
        <div className="auth-modal-footer">
          {mode === 'login' ? (
            <p>
              Don’t have an account yet?{' '}
              <button
                type="button"
                className="auth-inline-link"
                onClick={() => handleTabSwitch('signup')}
                disabled={loading}
              >
                Sign up free
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-inline-link"
                onClick={() => handleTabSwitch('login')}
                disabled={loading}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthModal
