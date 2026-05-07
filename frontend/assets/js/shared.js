// ─── Shared Frontend Helpers ─────────────────────────────────────────────────
var _appProto = window.location.protocol === 'https:' ? 'https:' : 'http:'
var _appHost = window.location.hostname || 'localhost'
var _appBackendPort = window.APP_BACKEND_PORT || '8080'

window.APP_BASE_URL = window.APP_BASE_URL || (_appProto + '//' + _appHost + ':' + _appBackendPort)
window.APP_API_BASE = window.APP_API_BASE || (window.APP_BASE_URL + '/api')
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

var _audioQueue = []
var _audioUnlockReady = false
var _audioCurrent = null
var _audioQueueStorageKey = 'photobooth.pendingAudio'
var _audioUnlockedStorageKey = 'photobooth.audioUnlocked'

function loadQueuedAudio() {
  if (_audioQueue.length) return
  try {
    var raw = sessionStorage.getItem(_audioQueueStorageKey)
    if (!raw) return
    var parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      _audioQueue = parsed.filter(function(item) {
        return item && item.name
      })
    }
  } catch (err) {}
}

function saveQueuedAudio() {
  try {
    if (!_audioQueue.length) {
      sessionStorage.removeItem(_audioQueueStorageKey)
      return
    }
    sessionStorage.setItem(_audioQueueStorageKey, JSON.stringify(_audioQueue))
  } catch (err) {}
}

function queueAudio(name, options) {
  var next = { name: name, options: options || {} }
  var signature = JSON.stringify(next)
  var exists = _audioQueue.some(function(item) {
    return JSON.stringify(item) === signature
  })
  if (exists) return false

  _audioQueue.push(next)
  saveQueuedAudio()
  return true
}

function initAudioUnlock() {
  if (_audioUnlockReady) return

  try {
    _audioUnlockReady = sessionStorage.getItem(_audioUnlockedStorageKey) === '1'
  } catch (err) {}

  loadQueuedAudio()

  function unlock() {
    _audioUnlockReady = true
    try { sessionStorage.setItem(_audioUnlockedStorageKey, '1') } catch (err) {}
    try { flushQueuedAudio() } catch (err) {}
    document.removeEventListener('pointerdown', unlock, true)
    document.removeEventListener('touchstart', unlock, true)
    document.removeEventListener('keydown', unlock, true)
  }

  document.addEventListener('pointerdown', unlock, true)
  document.addEventListener('touchstart', unlock, true)
  document.addEventListener('keydown', unlock, true)
}

function flushQueuedAudio() {
  if (_audioCurrent) return
  if (!_audioQueue.length) return
  var queued = _audioQueue.slice()
  _audioQueue = []
  saveQueuedAudio()
  queued.forEach(function(item) {
    playAudio(item.name, item.options, true)
  })
}

// Play audio file hosted under backend /storage/audio/<name>
function playAudio(name, options, fromQueue) {
  if (!name) return null

  if (!_audioUnlockReady && !fromQueue) {
    queueAudio(name, options)
    return null
  }

  if (_audioCurrent && !_audioCurrent.paused && !_audioCurrent.ended) {
    if (!fromQueue) queueAudio(name, options)
    return null
  }

  try {
    var audioPath = appUrl('/storage/audio/' + encodeURIComponent(name))
    var a = new Audio()
    a.preload = 'auto'
    a.src = audioPath
    if (options && options.loop) a.loop = true
    if (options && typeof options.volume === 'number') a.volume = options.volume

    _audioCurrent = a

    var clearCurrent = function() {
      if (_audioCurrent === a) _audioCurrent = null
      flushQueuedAudio()
    }

    a.addEventListener('ended', clearCurrent, { once: true })
    a.addEventListener('error', clearCurrent, { once: true })

    var attempt = a.play()
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function(err) {
        if (_audioCurrent === a) _audioCurrent = null
        if (!_audioUnlockReady) {
          queueAudio(name, options)
        } else {
          console.warn('Audio play failed:', name, err)
        }
        flushQueuedAudio()
      })
    }
    return a
  } catch (err) {
    if (_audioCurrent && _audioCurrent.src === audioPath) _audioCurrent = null
    return null
  }
}

initAudioUnlock()
