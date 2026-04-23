// ─── State ─────────────────────────────────────────────────────────────
var session = null
var stream = null
var canonLiveView = null
var canonLiveProbeTimer = null
var canonFramePollTimer = null
var canonHealthTimer = null
var canonLastFrameAt = 0
var canonConsecutiveErrors = 0
var photos = []
var isCounting = false
var countdownSecs = 5
var sessionDuration = 300
var sessionLeft = 300
var sessionTimer = null
var cameraMode = 'canon'
var backendBase = window.APP_BASE_URL || 'http://localhost:8080'

function applyMirrorPreview(el) {
  if (!el) return
  el.style.transform = 'scaleX(-1)'
  el.style.webkitTransform = 'scaleX(-1)'
  el.style.transformOrigin = 'center center'
  el.style.webkitTransformOrigin = 'center center'
}

// ─── Init ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async function() {
  session = requireSession('category.html')
  if (!session) return

  sessionDuration = session.duration_secs || 300
  sessionLeft = sessionDuration

  document.getElementById('categoryLabel').textContent =
    session.category === 'vip' ? 'VIP — 8 Menit' : 'Regular — 5 Menit'

  await initCamera()
  startSessionTimer()
})

async function initCamera() {
  cameraMode = 'canon'
  var connected = false

  try {
    var result = await fetch(backendBase + '/api/robot/status')
    var data = await result.json()
    connected = !!(data && data.success && data.data && data.data.connected)
  } catch (err) {
    connected = false
  }

  if (connected) {
    await initCanonCamera()
    return
  }

  cameraMode = 'browser'
  await initBrowserCamera()
}

async function initCanonCamera() {
  destroyCanonLiveView()

  var video = document.getElementById('videoEl')
  video.style.display = 'none'
  video.srcObject = null

  canonLiveView = document.createElement('img')
  canonLiveView.id = 'canonLiveView'
  canonLiveView.alt = 'Canon 6D Live View'
  canonLiveView.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:none;z-index:1;'

  var cameraPanel = document.querySelector('.camera-panel')
  cameraPanel.insertBefore(canonLiveView, video)

  var pollingReady = await startCanonFramePolling()
  if (!pollingReady) {
    await fallbackCanonPreview('Live view Canon belum tersedia')
    return
  }

  startCanonHealthWatchdog()

  document.getElementById('cameraPlaceholder').style.display = 'none'
  document.getElementById('categoryLabel').textContent += ' · Canon 6D'
  showToast('Canon 6D terhubung!', 'success')
}

async function fallbackCanonPreview(message) {
  if (canonLiveProbeTimer) {
    clearTimeout(canonLiveProbeTimer)
    canonLiveProbeTimer = null
  }

  // Coba mode kompatibilitas: polling frame JPEG tunggal dari endpoint liveview.
  var pollingReady = await startCanonFramePolling()
  if (pollingReady) {
    showToast(message + ', pindah ke mode live kompatibilitas', 'info')
    return
  }

  // Tetap pakai mode capture Canon, browser hanya untuk preview agar layar tidak hitam.
  destroyCanonLiveView()
  await initBrowserCamera(false)
  showToast(message + ', preview memakai kamera browser', 'info')
}

function stopCanonFramePolling() {
  if (canonFramePollTimer) {
    clearTimeout(canonFramePollTimer)
    canonFramePollTimer = null
  }

  if (canonHealthTimer) {
    clearInterval(canonHealthTimer)
    canonHealthTimer = null
  }
}

function startCanonHealthWatchdog() {
  if (canonHealthTimer) {
    clearInterval(canonHealthTimer)
    canonHealthTimer = null
  }

  canonHealthTimer = setInterval(function() {
    if (!canonLiveView) return
    if (!canonLastFrameAt) return
    if (Date.now() - canonLastFrameAt > 2500) {
      // Jika frame berhenti update, trigger polling ulang.
      startCanonFramePolling().catch(function() {})
    }
  }, 1200)
}

async function startCanonFramePolling() {
  if (!canonLiveView || !canonLiveView.parentNode) {
    return false
  }

  stopCanonFramePolling()

  var img = canonLiveView
  var loaded = false
  var firstDone = false
  canonConsecutiveErrors = 0

  function scheduleNext(delay) {
    if (!canonLiveView || canonLiveView !== img) return
    canonFramePollTimer = setTimeout(loadFrame, delay)
  }

  function loadFrame() {
    if (!canonLiveView || canonLiveView !== img) return
    img.src = backendBase + '/api/robot/liveview?t=' + Date.now()
  }

  return await new Promise(function(resolve) {
    img.onload = function() {
      loaded = true
      canonConsecutiveErrors = 0
      canonLastFrameAt = Date.now()
      if (!firstDone) {
        firstDone = true
        resolve(true)
        scheduleNext(95)
        return
      }
      scheduleNext(95)
    }
    img.onerror = function() {
      canonConsecutiveErrors++
      if (!firstDone) {
        firstDone = true
        resolve(false)
        return
      }
      if (canonConsecutiveErrors >= 10) {
        fallbackCanonPreview('Live view Canon terputus').catch(function() {})
        return
      }
      scheduleNext(220)
    }

    loadFrame()

    setTimeout(function() {
      if (!firstDone) {
        firstDone = true
        resolve(loaded)
      }
    }, 3500)
  })
}

function destroyCanonLiveView() {
  stopCanonFramePolling()
  canonLastFrameAt = 0
  canonConsecutiveErrors = 0

  if (canonLiveProbeTimer) {
    clearTimeout(canonLiveProbeTimer)
    canonLiveProbeTimer = null
  }
  if (canonLiveView && canonLiveView.parentNode) {
    canonLiveView.parentNode.removeChild(canonLiveView)
  }
  canonLiveView = null
}

async function initBrowserCamera(updateMode) {
  if (typeof updateMode === 'undefined') updateMode = true

  destroyCanonLiveView()

  if (stream) {
    stream.getTracks().forEach(function(t) { t.stop() })
    stream = null
  }

  if (updateMode) {
    cameraMode = 'browser'
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
    var video = document.getElementById('videoEl')
    video.srcObject = stream
    video.style.display = 'block'
    applyMirrorPreview(video)
    document.getElementById('cameraPlaceholder').style.display = 'none'
  } catch (err) {
    document.getElementById('videoEl').style.display = 'none'
    document.getElementById('cameraPlaceholder').style.display = 'flex'
    showToast('Gagal akses kamera browser: ' + err.message, 'error')
  }
}

// ─── Capture ─────────────────────────────────────────────────────────────
async function capturePhoto() {
  if (cameraMode === 'canon') {
    return captureCanon()
  }
  return captureBrowser()
}

async function captureCanon() {
  var flash = document.getElementById('cameraFlash')
  flash.classList.remove('flash')
  void flash.offsetWidth
  flash.classList.add('flash')

  try {
    var res = await fetch(backendBase + '/api/robot/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id }),
    })
    var data = await res.json()
    if (!data.success) throw new Error(data.error || 'Gagal capture')

    addCapturedPhoto(data.data)
  } catch (err) {
    showToast('Gagal capture: ' + err.message, 'error')
  }
}

async function captureBrowser() {
  var video = document.getElementById('videoEl')
  var canvas = document.getElementById('captureCanvas')
  var flash = document.getElementById('cameraFlash')

  flash.classList.remove('flash')
  void flash.offsetWidth
  flash.classList.add('flash')

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  var ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0)

  var blob = await new Promise(function(resolve) {
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })

  try {
    var photo = await API.uploadPhoto(session.id, blob)
    addCapturedPhoto(photo)
  } catch (err) {
    showToast('Gagal upload foto: ' + err.message, 'error')
  }
}

function addCapturedPhoto(photo) {
  photos.push(photo)

  var grid = document.getElementById('thumbnailsGrid')
  var empty = document.getElementById('emptyThumb')
  empty.style.display = 'none'

  var imgSrc = photo.url && photo.url.startsWith('http') ? photo.url : (photo.url ? (backendBase + photo.url) : appUrl(photo.url))
  var item = document.createElement('div')
  item.className = 'thumb-item'
  item.innerHTML = '<img src="' + imgSrc + '" alt="foto ' + photos.length + '" loading="lazy" />' +
    '<span class="thumb-number">' + photos.length + '</span>'

  grid.appendChild(item)
  grid.parentElement.scrollTop = grid.parentElement.scrollHeight
  document.getElementById('photoCount').textContent = photos.length
  if (photos.length >= 1) document.getElementById('doneBtn').classList.add('visible')
}

// ─── Session Timer ──────────────────────────────────────────────────────
function startSessionTimer() {
  if (sessionTimer) sessionTimer.stop()
  sessionTimer = startCountdownTimer(sessionDuration, function(remaining) {
    sessionLeft = remaining
    updateTimerUI()
  }, endSession)
}

function updateTimerUI() {
  var m = Math.floor(sessionLeft / 60).toString().padStart(2, '0')
  var s = (sessionLeft % 60).toString().padStart(2, '0')
  var pct = (sessionLeft / sessionDuration) * 100
  var display = document.getElementById('sessionTimeDisplay')
  var fill = document.getElementById('timerFill')
  display.textContent = m + ':' + s
  fill.style.width = pct + '%'
  var isWarning = sessionLeft <= 60
  display.classList.toggle('warning', isWarning)
  fill.classList.toggle('warning', isWarning)
}

function endSession() {
  if (sessionTimer) { sessionTimer.stop(); sessionTimer = null }
  if (stream) stream.getTracks().forEach(function(t) { t.stop() })
  destroyCanonLiveView()
  document.getElementById('captureBtn').disabled = true
  document.getElementById('sessionEnded').classList.add('show')
}

// ─── Countdown ─────────────────────────────────────────────────────────
function setCountdown(secs) {
  countdownSecs = secs
  document.querySelectorAll('.countdown-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.textContent === secs + 's')
  })
}

// ─── Capture Flow ──────────────────────────────────────────────────────
async function startCapture() {
  if (isCounting) return
  if (cameraMode === 'browser' && !stream) return
  isCounting = true

  var btn = document.getElementById('captureBtn')
  btn.disabled = true
  btn.classList.add('counting')
  btn.innerHTML = '<span class="spinner"></span> Bersiap...'

  await runCountdown(countdownSecs)
  await capturePhoto()

  isCounting = false
  btn.disabled = false
  btn.classList.remove('counting')
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="4" fill="currentColor"/></svg> Ambil Foto'
}

function runCountdown(from) {
  return new Promise(function(resolve) {
    var el = document.getElementById('countdownNum')
    var count = from
    function tick() {
      el.textContent = count
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      if (count <= 0) {
        setTimeout(function() { el.classList.remove('show'); resolve() }, 800)
        return
      }
      count--
      setTimeout(tick, 1000)
    }
    tick()
  })
}

// ─── Done ──────────────────────────────────────────────────────────────
function goToFrame() {
  if (photos.length === 0) {
    showToast('Ambil minimal 1 foto dulu!', 'error')
    return
  }
  Session.setSelectedPhotos(photos.map(function(p) { return p.id }))
  if (stream) stream.getTracks().forEach(function(t) { t.stop() })
  destroyCanonLiveView()
  if (sessionTimer) { sessionTimer.stop(); sessionTimer = null }
  API.patch('/session/' + session.id + '/status', { status: 'completed' }).catch(function() {})
  navigate('frame.html')
}