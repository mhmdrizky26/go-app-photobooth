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
var robotConnected = false
var currentPreset = 0
var displayPreset = 0
var presetPollTimer = null
var photoPollTimer = null
var autoCaptureEndsAt = 0
var autoCaptureUiTimer = null
var autoCaptureCountdownStarted = false
var autoCaptureLastSecond = -1
var freezePreviewOverlay = null
var freezePreviewTimer = null
var freezePreviewToken = 0
var sessionDuration = 300
var sessionLeft = 300
var sessionTimer = null
var cameraMode = 'canon'
var backendBase = window.APP_BASE_URL || (window.location.protocol + '//' + (window.location.hostname || 'localhost') + ':8080')
var transitionOverlay = null

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

  showTransitionOverlay()

  sessionDuration = session.duration_secs || 300
  sessionLeft = sessionDuration

  var presetStatusText = document.getElementById('presetStatusText')
  if (presetStatusText) {
    var sessionLabel = session.category === 'vip' ? 'VIP — 8 Menit' : 'Regular — 5 Menit'
    presetStatusText.innerHTML = 'Sesi <strong>' + sessionLabel + '</strong>. Bar preset akan aktif saat robot berjalan.'
  }

  initPresetStrip()
  await initCamera()
  await refreshPresetStatus()
  startPresetPolling()
  startPhotoPolling()
  startAutoCaptureUiTimer()
  startSessionTimer()

  playQueuedTransitionAudio()
})

async function initCamera() {
  cameraMode = 'canon'
  var connected = false

  try {
    var result = await API.getRobotStatus()
    connected = !!(result && result.connected)
  } catch (err) {
    connected = false
  }

  robotConnected = connected

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
  showToast('Canon 6D terhubung!', 'success')
  playInitiationAudioOnce()
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

function hideFreezePreview() {
  freezePreviewToken += 1

  if (freezePreviewTimer) {
    clearTimeout(freezePreviewTimer)
    freezePreviewTimer = null
  }

  if (!freezePreviewOverlay) return

  var overlay = freezePreviewOverlay
  freezePreviewOverlay = null
  overlay.classList.remove('show')

  setTimeout(function() {
    try { overlay.remove() } catch (e) {}
  }, 240)
}

function showFreezePreview(url, durationMs) {
  if (!durationMs) durationMs = 3000
  if (!url) return

  hideFreezePreview()
  var token = freezePreviewToken

  // Convert relative URL to absolute
  var absoluteUrl = url
  if (url.startsWith('/')) {
    absoluteUrl = backendBase + url
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    absoluteUrl = backendBase + '/' + url
  }

  var overlay = document.createElement('div')
  overlay.className = 'freeze-preview-overlay'
  overlay.innerHTML =
    '<div class="freeze-preview-card">' +
      '<div class="freeze-preview-header">' +
        '<span>Hasil capture</span>' +
        '<strong>Ditampilkan 3 detik</strong>' +
      '</div>' +
      '<div class="freeze-preview-frame">' +
        '<img class="freeze-preview-image" alt="Hasil capture" />' +
      '</div>' +
    '</div>'

  var image = overlay.querySelector('.freeze-preview-image')
  image.src = absoluteUrl

  var attachOverlay = function() {
    if (token !== freezePreviewToken) return
    if (freezePreviewOverlay) return
    document.body.appendChild(overlay)
    freezePreviewOverlay = overlay
    requestAnimationFrame(function() {
      if (token !== freezePreviewToken) return
      overlay.classList.add('show')
    })
    freezePreviewTimer = setTimeout(function() {
      if (token !== freezePreviewToken) return
      hideFreezePreview()
    }, durationMs)
  }

  if (image.complete && image.naturalWidth > 0) {
    attachOverlay()
    return
  }

  image.onload = attachOverlay
  image.onerror = attachOverlay
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
  // Three-second countdown with audio (tiga, dua, satu)
  var countdownEl = document.getElementById('countdownNum')
  var mapping = { 3: 'tiga.mp3', 2: 'dua.mp3', 1: 'satu.mp3' }
  if (countdownEl) {
    for (var i = 3; i >= 1; i--) {
      countdownEl.textContent = String(i)
      countdownEl.classList.add('show')
      try { playAudio(mapping[i]) } catch (e) {}
      // wait ~1s
      await new Promise(function(res) { setTimeout(res, 1000) })
      countdownEl.classList.remove('show')
    }
  } else {
    // fallback small delay if UI element missing
    await new Promise(function(res) { setTimeout(res, 3000) })
  }

  // Trigger flash and capture
  var flash = document.getElementById('cameraFlash')
  flash.classList.remove('flash')
  void flash.offsetWidth
  flash.classList.add('flash')

  try {
    var photo = await API.captureRobot(session.id)
    
    // Freeze preview so user can see the captured photo for 3 seconds
    try {
      var photoUrl = (photo && (photo.url || photo.URL)) || null
      if (photoUrl) showFreezePreview(photoUrl, 3000)
    } catch (e) {}

    addCapturedPhoto(photo)
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
    // Freeze preview so user can see the captured photo for 3 seconds
    try {
      var photoUrl = (photo && (photo.url || photo.URL)) || null
      if (photoUrl) showFreezePreview(photoUrl, 3000)
    } catch (e) {}

    addCapturedPhoto(photo)
  } catch (err) {
    showToast('Gagal upload foto: ' + err.message, 'error')
  }
}

function addCapturedPhoto(photo) {
  photos.push(photo)
  document.getElementById('photoCount').textContent = photos.length
  if (photos.length >= 1) {
    var doneBtn = document.getElementById('doneBtn')
    if (doneBtn) doneBtn.style.display = 'inline-flex'
  }
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
  stopPresetPolling()
  stopPhotoPolling()
  stopAutoCaptureUiTimer()
  
  // Auto-redirect to frame selection page
  setTimeout(function() {
    goToFrameAfterSessionEnd()
  }, 500)
}

// ─── Done ──────────────────────────────────────────────────────────────
function goToFrame() {
  if (photos.length === 0) {
    showToast('Ambil minimal 1 foto dulu!', 'error')
    return
  }
  
  // Disable robot when entering frame selection page
  try {
    API.disableRobot().catch(function() {})
  } catch (e) {}
  
  Session.setSelectedPhotos(photos.map(function(p) { return p.id }))
  if (stream) stream.getTracks().forEach(function(t) { t.stop() })
  destroyCanonLiveView()
  stopPresetPolling()
  stopPhotoPolling()
  stopAutoCaptureUiTimer()
  if (sessionTimer) { sessionTimer.stop(); sessionTimer = null }
  API.updateSessionStatus(session.id, 'completed').catch(function() {})
  navigate('frame.html')
}

function goToFrameAfterSessionEnd() {
  Session.setSelectedPhotos(photos.map(function(p) { return p.id }))
  if (stream) stream.getTracks().forEach(function(t) { t.stop() })
  destroyCanonLiveView()
  stopPresetPolling()
  stopPhotoPolling()
  stopAutoCaptureUiTimer()
  if (sessionTimer) { sessionTimer.stop(); sessionTimer = null }
  
  // Disable robot when entering frame selection page (after session ends)
  try {
    API.disableRobot().catch(function() {})
  } catch (e) {}
  
  API.updateSessionStatus(session.id, 'completed').catch(function() {})
  navigate('frame.html')
}

// ─── Preset Strip ───────────────────────────────────────────────────────
function initPresetStrip() {
  var strip = document.getElementById('presetStrip')
  if (!strip) return

  strip.innerHTML = ''
  for (var i = 1; i <= 10; i++) {
    var chip = document.createElement('div')
    chip.className = 'preset-chip'
    chip.dataset.preset = String(i)
    chip.setAttribute('aria-label', 'Preset ' + i)
    chip.innerHTML = '<span class="preset-chip-icon"></span>' +
      '<span class="preset-chip-number">' + String(i).padStart(2, '0') + '</span>' +
      '<span class="preset-chip-label">Preset</span>'
    strip.appendChild(chip)
  }
}

async function refreshPresetStatus() {
  try {
    var data = await API.getRobotConfig()
    var prevPreset = currentPreset || 0
    var prevAutoCaptureEndsAt = autoCaptureEndsAt
    currentPreset = parseInt(data && data.current_preset, 10) || 0
    if (currentPreset > 0) {
      displayPreset = currentPreset
    }
    autoCaptureEndsAt = parseAutoCaptureEndsAt(data)
    
    // Reset countdown display when auto-capture status changes
    if (prevAutoCaptureEndsAt !== autoCaptureEndsAt) {
      autoCaptureCountdownStarted = false
      autoCaptureLastSecond = -1
      var countdownNum = document.getElementById('countdownNum')
      if (countdownNum) {
        countdownNum.classList.remove('show')
      }
    }
    
    renderPresetStatus()
    // Play confirmation audio when robot starts moving to a new preset
    if (currentPreset > 0 && prevPreset !== currentPreset) {
      try { playAudio('presetTerkonfirmasi.mp3') } catch (e) {}
    }
  } catch (err) {
    renderPresetStatus()
  }
}

function startPresetPolling() {
  stopPresetPolling()
  presetPollTimer = setInterval(refreshPresetStatus, 1000)
}

function stopPresetPolling() {
  if (presetPollTimer) {
    clearInterval(presetPollTimer)
    presetPollTimer = null
  }
}

function renderPresetStatus() {
  var statusLabel = document.getElementById('presetStatusLabel')
  var statusText = document.getElementById('presetStatusText')
  var fill = document.getElementById('presetProgressFill')
  var autoCapturePill = document.getElementById('autoCapturePill')
  var autoCaptureCountdown = document.getElementById('autoCaptureCountdown')
  var activePreset = displayPreset || currentPreset || 0

  document.querySelectorAll('.preset-chip').forEach(function(chip) {
    var preset = parseInt(chip.dataset.preset, 10)
    chip.classList.toggle('active', preset === activePreset)
  })

  if (autoCapturePill && autoCaptureCountdown) {
    var remainingMs = autoCaptureEndsAt ? (autoCaptureEndsAt - Date.now()) : 0
    if (remainingMs > 0) {
      autoCaptureCountdown.textContent = Math.ceil(remainingMs / 1000) + 's'
      autoCapturePill.classList.add('show')
      autoCapturePill.classList.add('active')
    } else if (autoCaptureEndsAt > 0) {
      autoCaptureCountdown.textContent = '3s'
      autoCapturePill.classList.add('show')
      autoCapturePill.classList.remove('active')
    } else {
      autoCapturePill.classList.remove('show')
      autoCapturePill.classList.remove('active')
    }
  }

  if (!statusLabel || !statusText || !fill) return

  if (!robotConnected) {
    statusLabel.textContent = 'Robot tidak terhubung'
    statusText.innerHTML = 'Preview memakai kamera browser, bar preset menunggu koneksi robot.'
    fill.classList.remove('active')
    fill.style.width = '0%'
    return
  }

  if (autoCaptureEndsAt && autoCaptureEndsAt > Date.now()) {
    var captureSeconds = Math.max(1, Math.ceil((autoCaptureEndsAt - Date.now()) / 1000))
    statusLabel.textContent = 'Auto capture ' + captureSeconds + ' detik'
    statusText.innerHTML = 'Foto otomatis akan diambil dalam <strong>' + captureSeconds + ' detik</strong>.'
    fill.classList.add('active')
    return
  }

  if (activePreset > 0) {
    var presetNumber = String(activePreset).padStart(2, '0')
    statusLabel.textContent = 'Preset ' + presetNumber + ' aktif'
    statusText.innerHTML = 'Robot sedang berjalan di <strong>preset ' + presetNumber + '</strong>.'
    fill.classList.add('active')
    return
  }

  statusLabel.textContent = 'Menunggu preset'
  statusText.innerHTML = 'Bar preset akan aktif saat robot berjalan.'
  fill.classList.remove('active')
  fill.style.width = '0%'
}

// ─── Session Photo Polling ─────────────────────────────────────────────
async function refreshSessionPhotos() {
  if (!session || !session.id) return
  try {
    var list = await API.getSessionPhotos(session.id)
    if (!Array.isArray(list)) return

    // detect newly added photos so we can show freeze-preview to user
    try {
      var oldIds = photos.map(function(p) { return p && p.id })
      var added = list.filter(function(p) { return p && oldIds.indexOf(p.id) === -1 })
      if (added && added.length) {
        // show freeze preview for the most recent added photo
        var latest = added[added.length - 1]
        try {
          var photoUrl = (latest && (latest.url || latest.URL)) || null
          if (photoUrl) showFreezePreview(photoUrl, 3000)
        } catch (e) {}
      }
    } catch (e) {}

    photos = list.slice() // replace local list with server canonical list
    document.getElementById('photoCount').textContent = photos.length
    var doneBtn = document.getElementById('doneBtn')
    if (doneBtn) doneBtn.style.display = (photos.length >= 1) ? 'inline-flex' : 'none'
  } catch (err) {
    // ignore transient errors
  }
}

function startPhotoPolling() {
  stopPhotoPolling()
  // initial immediate fetch
  refreshSessionPhotos()
  photoPollTimer = setInterval(refreshSessionPhotos, 1000)
}

function stopPhotoPolling() {
  if (photoPollTimer) {
    clearInterval(photoPollTimer)
    photoPollTimer = null
  }
}

function parseAutoCaptureEndsAt(data) {
  if (!data) return 0

  if (data.auto_capture_active && data.auto_capture_at) {
    var activeTs = Date.parse(data.auto_capture_at)
    if (!isNaN(activeTs)) return activeTs
  }

  if (data.auto_capture_remaining_ms && data.auto_capture_remaining_ms > 0) {
    return Date.now() + data.auto_capture_remaining_ms
  }

  if (data.auto_capture_at) {
    var ts = Date.parse(data.auto_capture_at)
    if (!isNaN(ts)) return ts
  }

  return 0
}

function startAutoCaptureUiTimer() {
  stopAutoCaptureUiTimer()
  autoCaptureUiTimer = setInterval(renderAutoCaptureCountdown, 200)
  renderAutoCaptureCountdown()
}

function stopAutoCaptureUiTimer() {
  if (autoCaptureUiTimer) {
    clearInterval(autoCaptureUiTimer)
    autoCaptureUiTimer = null
  }
}

function renderAutoCaptureCountdown() {
  var pill = document.getElementById('autoCapturePill')
  var countdown = document.getElementById('autoCaptureCountdown')
  var countdownNum = document.getElementById('countdownNum')
  if (!pill || !countdown) return

  var remainingMs = autoCaptureEndsAt ? (autoCaptureEndsAt - Date.now()) : 0
  if (remainingMs > 0) {
    var seconds = Math.ceil(remainingMs / 1000)
    countdown.textContent = seconds + 's'
    pill.classList.add('show')
    pill.classList.add('active')

    // Show big countdown display (3 2 1 0) during last 4 seconds
    if (seconds <= 4) {
      if (!autoCaptureCountdownStarted) {
        autoCaptureCountdownStarted = true
        autoCaptureLastSecond = -1
      }
      
      // Play audio and display on each second boundary
      if (autoCaptureLastSecond !== seconds) {
        autoCaptureLastSecond = seconds
        
        if (countdownNum && seconds >= 1 && seconds <= 3) {
          countdownNum.textContent = String(seconds)
          countdownNum.classList.remove('show')
          void countdownNum.offsetWidth // Force reflow to restart animation
          countdownNum.classList.add('show')
          
          // Play audio: tiga (3), dua (2), satu (1)
          var audioMapping = { 3: 'tiga.mp3', 2: 'dua.mp3', 1: 'satu.mp3' }
          if (audioMapping[seconds]) {
            try { playAudio(audioMapping[seconds]) } catch (e) {}
          }
        } else if (countdownNum && seconds === 0) {
          // Show 0 on capture
          countdownNum.textContent = '0'
          countdownNum.classList.remove('show')
          void countdownNum.offsetWidth
          countdownNum.classList.add('show')
        }
      }
    } else {
      // Reset countdown state when above 4 seconds
      autoCaptureCountdownStarted = false
      autoCaptureLastSecond = -1
      if (countdownNum) {
        countdownNum.classList.remove('show')
      }
    }
    return
  }

  // Reset when countdown ends
  autoCaptureCountdownStarted = false
  autoCaptureLastSecond = -1
  if (countdownNum) {
    countdownNum.classList.remove('show')
  }

  countdown.textContent = '3s'
  if (autoCaptureEndsAt > 0) {
    pill.classList.add('show')
  } else {
    pill.classList.remove('show')
  }
  pill.classList.remove('active')
}

function initiationAudioKey(sessionID) {
  return 'photobooth.initiationPlayed.' + sessionID
}

function playInitiationAudioOnce() {
  if (!session || !session.id) return
  try {
    if (sessionStorage.getItem(initiationAudioKey(session.id)) === '1') return
    sessionStorage.setItem(initiationAudioKey(session.id), '1')
  } catch (e) {}
  playAudio('inisiasi.mp3')
}

function showTransitionOverlay() {
  var overlay = document.createElement('div')
  overlay.id = 'pageTransitionOverlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(1,57,94,0.96);color:#dcdddd;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);'
  overlay.innerHTML = '<div class="spinner" style="width:28px;height:28px;border-top-color:#dcdddd"></div><div style="font-family:var(--font-display);font-size:22px;letter-spacing:-0.01em">Memulai sesi foto...</div>'
  document.body.appendChild(overlay)
  transitionOverlay = overlay
}

function hideTransitionOverlay() {
  if (!transitionOverlay) return
  try { transitionOverlay.remove() } catch (e) {}
  transitionOverlay = null
}

function playQueuedTransitionAudio() {
  var audioName = ''
  try {
    audioName = sessionStorage.getItem('photobooth.transition.audio') || ''
    sessionStorage.removeItem('photobooth.transition.audio')
    sessionStorage.removeItem('photobooth.transition.target')
  } catch (e) {}

  if (!audioName) {
    hideTransitionOverlay()
    return
  }

  var audio = playAudio(audioName)
  if (!audio) {
    if (transitionOverlay) {
      transitionOverlay.innerHTML = '<div class="spinner" style="width:28px;height:28px;border-top-color:#dcdddd"></div><div style="font-family:var(--font-display);font-size:22px;letter-spacing:-0.01em;text-align:center">Memulai sesi foto...</div>'
    }
    setTimeout(hideTransitionOverlay, 1500)
    return
  }

  var finish = function() { hideTransitionOverlay() }
  audio.addEventListener('ended', finish, { once: true })
  audio.addEventListener('error', finish, { once: true })
  setTimeout(finish, 7000)
}