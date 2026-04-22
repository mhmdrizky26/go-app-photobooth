var TIMER_DURATION = 60
var timerLeft = TIMER_DURATION
var timerHandle = null
var session = null
var frameData = null
var galleryURL = ''
var qrResizeTicking = false
var robotDisableDispatched = false
var redirectStarted = false

var BASE_URL = window.APP_BASE_URL || (window.location.protocol + '//' + (window.location.hostname || 'localhost') + ':8080')
var ROBOT_DISABLE_URL = BASE_URL + '/api/robot/disable'

window.addEventListener('DOMContentLoaded', function() {
  session = requireSession('index.html')
  frameData = Session.get('frame_data')
  if (!session) return

  galleryURL = BASE_URL + '/gallery/' + session.id

  renderQRCode()
  renderGalleryLink()
  renderSessionInfo()
  startTimer()
})

function renderQRCode() {
  var qrBox = document.getElementById('qrBox')
  if (!qrBox || typeof QRCode === 'undefined') return

  qrBox.innerHTML = ''

  var boxSize = Math.max(160, Math.floor(qrBox.clientWidth || 220))
  var qrSize = Math.max(140, boxSize - 16)

  new QRCode(qrBox, {
    text: galleryURL,
    width: qrSize,
    height: qrSize,
    colorDark: '#0e0e0f',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  })
}

function queueRenderQRCode() {
  if (qrResizeTicking) return
  qrResizeTicking = true
  requestAnimationFrame(function() {
    qrResizeTicking = false
    renderQRCode()
  })
}

function renderGalleryLink() {
  var link = document.getElementById('galleryLink')
  if (!link) return
  link.href = galleryURL
  link.textContent = galleryURL
}

function renderSessionInfo() {
  var categoryEl = document.getElementById('infoCategory')
  var frameEl    = document.getElementById('infoFrame')
  var countEl    = document.getElementById('infoPhotoCount')
  var expiryEl   = document.getElementById('infoExpiry')

  if (categoryEl) categoryEl.textContent = session.category === 'vip' ? 'VIP' : 'Regular'
  if (frameEl)    frameEl.textContent    = frameData ? frameData.name : '-'
  if (countEl)    countEl.textContent    = '3 foto (1 strip)'

  if (expiryEl && session.expires_at) {
    var exp = new Date(session.expires_at)
    expiryEl.textContent = exp.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  }
}

function copyLink() {
  var btn = document.getElementById('copyBtn')
  if (!btn) return

  var onCopied = function() {
    btn.classList.add('copied')
    btn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="none">' +
        '<path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg> Tersalin!'
    setTimeout(function() {
      btn.classList.remove('copied')
      btn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none">' +
          '<rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>' +
          '<path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.5"/>' +
        '</svg> Salin Link'
    }, 2500)
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(galleryURL).then(onCopied).catch(function() {
      showToast('Gagal menyalin link', 'error')
    })
    return
  }

  // Fallback untuk browser lama
  var temp = document.createElement('textarea')
  temp.value = galleryURL
  document.body.appendChild(temp)
  temp.select()
  try {
    var ok = document.execCommand('copy')
    if (ok) onCopied(); else showToast('Gagal menyalin link', 'error')
  } catch (err) {
    showToast('Gagal menyalin link', 'error')
  }
  document.body.removeChild(temp)
}

function startTimer() {
  timerLeft = TIMER_DURATION
  updateTimerUI()
  timerHandle = setInterval(function() {
    timerLeft--
    updateTimerUI()
    if (timerLeft <= 0) {
      clearInterval(timerHandle)
      redirectToLanding()
    }
  }, 1000)
}

function updateTimerUI() {
  var m   = Math.floor(timerLeft / 60).toString().padStart(2, '0')
  var s   = (timerLeft % 60).toString().padStart(2, '0')
  var pct = (timerLeft / TIMER_DURATION) * 100

  var display = document.getElementById('timerDisplay')
  var fill    = document.getElementById('timerFill')
  if (!display || !fill) return

  display.textContent = m + ':' + s
  fill.style.width    = pct + '%'

  var warn = timerLeft <= 15
  display.classList.toggle('warning', warn)
  fill.classList.toggle('warning', warn)
}

function dispatchRobotDisable() {
  if (robotDisableDispatched) return Promise.resolve()
  robotDisableDispatched = true

  var fetchPromise = Promise.resolve(false)

  // 1) Coba fetch keepalive tanpa custom header agar tidak memicu preflight.
  fetchPromise = fetch(ROBOT_DISABLE_URL, {
    method: 'POST',
    keepalive: true,
    cache: 'no-store',
  }).then(function(res) {
    if (res.ok) {
      console.log('🤖 Robot disabled')
      return true
    } else {
      console.warn('Robot disable response:', res.status)
      return false
    }
  }).catch(function(err) {
    console.warn('Robot disable fetch failed:', err.message)
    return false
  })

  // 2) Fallback tambahan saat browser menghentikan request karena unload.
  if (navigator.sendBeacon) {
    try {
      navigator.sendBeacon(ROBOT_DISABLE_URL, new Blob(['{}'], { type: 'text/plain;charset=UTF-8' }))
    } catch (err) {
      console.warn('Robot disable beacon failed:', err.message)
    }
  }

  return fetchPromise
}

// Dipanggil saat timer habis ATAU user navigasi manual
function redirectToLanding() {
  if (redirectStarted) return
  redirectStarted = true

  // Nonaktifkan robot dulu, lalu lanjutkan redirect.
  var disablePromise = dispatchRobotDisable()

  var overlay = document.getElementById('redirectOverlay')
  if (overlay) overlay.classList.add('show')

  // Beri waktu singkat agar request disable sempat terkirim sebelum pindah halaman.
  Promise.race([
    disablePromise,
    new Promise(function(resolve) { setTimeout(function() { resolve(false) }, 1200) }),
  ]).finally(function() {
    Session.clear()
    setTimeout(function() { navigate('index.html') }, 900)
  })
}

window.addEventListener('pagehide', function() {
  // Jika user menutup/navigasi tab sebelum timer habis, tetap kirim disable sekali.
  dispatchRobotDisable()
})

window.addEventListener('resize', queueRenderQRCode)
window.addEventListener('orientationchange', queueRenderQRCode)