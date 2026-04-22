// ─── Shared Frontend Helpers ─────────────────────────────────────────────────
var _appProto = window.location.protocol === 'https:' ? 'https:' : 'http:'
var _appHost = window.location.hostname || 'localhost'
var _appBackendPort = window.APP_BACKEND_PORT || '8080'

window.APP_BASE_URL = window.APP_BASE_URL || (_appProto + '//' + _appHost + ':' + _appBackendPort)
window.APP_API_BASE = window.APP_API_BASE || (window.APP_BASE_URL + '/api')
window.APP_FRONTEND_BASE = window.APP_FRONTEND_BASE || window.location.origin
window.APP_THEME_COLORS = window.APP_THEME_COLORS || {
  'theme-cream':    { bg: '#dcdddd', slot: '#c7c9ca', text: '#01395e66' },
  'theme-black':    { bg: '#01395e', slot: '#0a507f', text: '#dcddddb3' },
  'theme-blush':    { bg: '#dde0e5', slot: '#ccd1d8', text: '#01395e66' },
  'theme-sage':     { bg: '#e3e6e5', slot: '#cfd3d2', text: '#01395e66' },
  'theme-lavender': { bg: '#dde1e8', slot: '#ccd3dd', text: '#01395e66' },
  'theme-gold':     { bg: '#e8eaec', slot: '#d2d5d8', text: '#01395e66' },
}

function appUrl(path) {
  if (!path) return path
  if (/^https?:\/\//i.test(path)) return path
  return window.APP_BASE_URL + (path.charAt(0) === '/' ? path : '/' + path)
}

function getThemeColors(themeKey) {
  return window.APP_THEME_COLORS[themeKey] || window.APP_THEME_COLORS['theme-cream']
}

function requireSession(redirectPage = 'category.html') {
  const session = Session.getSession()
  if (!session) {
    navigate(redirectPage)
    return null
  }
  return session
}

function startCountdownTimer(duration, onTick, onExpire) {
  let remaining = duration
  let handle = null

  function stop() {
    if (!handle) return
    clearInterval(handle)
    handle = null
  }

  function tick() {
    if (onTick) onTick(remaining)
    if (remaining <= 0) {
      stop()
      if (onExpire) onExpire()
      return
    }
    remaining--
  }

  tick()
  handle = setInterval(tick, 1000)

  return {
    stop,
    getRemaining() {
      return remaining
    },
    reset(nextDuration) {
      stop()
      remaining = typeof nextDuration === 'number' ? nextDuration : duration
      tick()
      handle = setInterval(tick, 1000)
    },
  }
}

function frontendUrl(path) {
  if (!path) return path
  if (/^https?:\/\//i.test(path)) return path
  return window.APP_FRONTEND_BASE + (path.charAt(0) === '/' ? path : '/' + path)
}