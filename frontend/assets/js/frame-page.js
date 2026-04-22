var session       = null
var frames        = []
var selectedFrame = null

var FRAME_TIMER      = 90
var frameTimerLeft   = FRAME_TIMER
var frameTimerHandle = null

var frameIdToTheme = {
  'frame-cream-classic':  { theme:'theme-cream',  top:'Jonas Photo',   bottom:'— capture your moment —'     },
  'frame-noir-gold':      { theme:'theme-black',  top:'STUDIO',        bottom:'✦ PHOTO BOOTH ✦'             },
  'frame-blush-romantic': { theme:'theme-blush',  top:'♡ memories ♡', bottom:'— with love —'                },
  'frame-minimal-white':  { theme:'theme-cream',  top:'Jonas Photo',   bottom:'capture · connect · cherish'  },
  'frame-vintage-film':   { theme:'theme-black',  top:'VINTAGE FILM',  bottom:'© JONAS PHOTO MMXXIV'        },
}
var fallbackThemes = [
  { theme:'theme-cream',    top:'Jonas Photo',   bottom:'— capture your moment —' },
  { theme:'theme-black',    top:'STUDIO',        bottom:'✦ PHOTO BOOTH ✦'         },
  { theme:'theme-blush',    top:'♡ memories ♡', bottom:'— with love —'            },
  { theme:'theme-sage',     top:'Jonas Photo',   bottom:'— nature & you —'        },
  { theme:'theme-lavender', top:'✿ moments ✿',  bottom:'— forever yours —'        },
  { theme:'theme-gold',     top:'LUXE STUDIO',   bottom:'— elegance —'            },
]

window.addEventListener('DOMContentLoaded', async function() {
  session = requireSession('category.html')
  if (!session) { return }
  await loadFrames()
  startFrameTimer()
})

// ─── Timer ─────────────────────────────────────────────────────────────
function startFrameTimer() {
  if (frameTimerHandle) frameTimerHandle.stop()
  frameTimerHandle = startCountdownTimer(FRAME_TIMER, function(remaining) {
    frameTimerLeft = remaining
    updateFrameTimerUI()
  }, autoNextFrame)
}
function updateFrameTimerUI() {
  var m = Math.floor(frameTimerLeft/60).toString().padStart(2,'0')
  var s = (frameTimerLeft%60).toString().padStart(2,'0')
  var el = document.getElementById('frameTimerDisplay')
  var dot = document.getElementById('frameTimerDot')
  if (!el) return
  el.textContent = m+':'+s
  if (frameTimerLeft <= 20) { el.classList.add('warning'); if(dot) dot.classList.add('warning') }
}

function autoNextFrame() {
  if (!selectedFrame && frames.length > 0) {
    var firstItem = document.querySelector('.frame-item')
    if (firstItem) selectFrame(frames[0], firstItem, getThemeForFrame(frames[0]))
  }
  showToast('Waktu habis! Melanjutkan...', 'info')
  setTimeout(function() { goToSelect() }, 1000)
}

// ─── Load Frames ───────────────────────────────────────────────────────
async function loadFrames() {
  var grid = document.getElementById('frameGrid')
  try {
    var result = await API.getFrames()
    frames = result || []
    grid.innerHTML = ''
    if (frames.length === 0) { renderDefaultFrames(); return }
    frames.forEach(function(frame, i) { renderFrameItem(frame, i) })
  } catch(err) { renderDefaultFrames() }
}
function renderDefaultFrames() {
  frames = fallbackThemes.map(function(t, i) {
    return { id:'default-'+i, name:t.theme.replace('theme-','').replace(/^\w/,function(c){return c.toUpperCase()}),
      theme:t.theme, top_text:t.top, bottom_text:t.bottom, photo_slots:3, is_default:true }
  })
  document.getElementById('frameGrid').innerHTML = ''
  frames.forEach(function(frame, i) { renderFrameItem(frame, i) })
}
function getThemeForFrame(frame) {
  if (frameIdToTheme[frame.id]) return frameIdToTheme[frame.id]
  if (frame.theme) return { theme:frame.theme, top:frame.top_text, bottom:frame.bottom_text }
  return fallbackThemes[0]
}

function renderFrameItem(frame, index) {
  var grid = document.getElementById('frameGrid')
  var t    = getThemeForFrame(frame)
  var tc   = getThemeColors(t.theme)
  var neutralTc = getThemeColors('theme-cream')

  var item = document.createElement('div')
  item.className = 'frame-item animate-in'
  item.style.animationDelay = (index * 0.06) + 's'
  item.dataset.frameId = frame.id
  item.dataset.frameName = frame.name || 'Frame'

  // Checkmark
  var check = document.createElement('div')
  check.className = 'frame-check'
  check.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="#dcdddd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

  // Thumbnail
  var thumb = document.createElement('div')
  thumb.className = 'frame-thumb'
  thumb.style.background = 'var(--bg-elevated)'

  if (frame.thumb_url) {
    var src = appUrl(frame.thumb_url)

    // Gambar PNG asli frame — object-fit contain agar full frame terlihat
    var img = document.createElement('img')
    img.alt = frame.name
    img.src = src

    // Fallback
    var fb = buildFallback(neutralTc, t)
    fb.style.display = 'none'
    img.addEventListener('error', function() { img.style.display='none'; fb.style.display='flex' })

    thumb.appendChild(img)
    thumb.appendChild(fb)
  } else {
    var fb2 = buildFallback(neutralTc, t)
    fb2.style.display = 'flex'
    thumb.appendChild(fb2)
  }

  // Info
  var info = document.createElement('div')
  info.className = 'frame-item-info'
  info.innerHTML = '<div class="frame-item-name">'+frame.name+'</div><div class="frame-item-slots">3 slot foto</div>'

  item.appendChild(check)
  item.appendChild(thumb)
  item.appendChild(info)
  item.addEventListener('click', function() { selectFrame(frame, item, t) })
  grid.appendChild(item)
}

function buildFallback(tc, t) {
  var fb = document.createElement('div')
  fb.className = 'frame-thumb-fallback'
  fb.style.background = tc.bg

  var top = document.createElement('div')
  top.className = 'frame-thumb-top'
  top.style.color = tc.text
  top.textContent = t.top

  var slots = document.createElement('div')
  slots.className = 'frame-thumb-slots'
  for (var i=0;i<3;i++) {
    var s = document.createElement('div')
    s.className = 'frame-thumb-slot'
    s.style.background = tc.slot
    slots.appendChild(s)
  }

  var bot = document.createElement('div')
  bot.className = 'frame-thumb-bottom'
  bot.style.color = tc.text
  bot.textContent = t.bottom

  fb.appendChild(top); fb.appendChild(slots); fb.appendChild(bot)
  return fb
}

// ─── Select Frame ──────────────────────────────────────────────────────
function selectFrame(frame, itemEl, theme) {
  document.querySelectorAll('.frame-item').forEach(function(el) { el.classList.remove('selected') })
  itemEl.classList.add('selected')

  var t  = theme || fallbackThemes[0]
  var tc = getThemeColors(t.theme)
  var neutralTc = getThemeColors('theme-cream')

  selectedFrame = {
    id:          frame.id,
    name:        frame.name,
    theme:       t.theme,
    top_text:    t.top    || frame.top_text    || 'Jonas Photo',
    bottom_text: t.bottom || frame.bottom_text || '— capture your moment —',
    thumb_url:   frame.thumb_url || '',
    photo_slots: 3,
  }

  // Keep preview background neutral like the select page
  var stripReal = document.getElementById('stripReal')
  stripReal.style.background = neutralTc.bg
  document.querySelectorAll('.strip-real-slot').forEach(function(s) {
    s.style.background = neutralTc.slot
  })

  // Tampilkan frame PNG asli sebagai overlay di preview kiri
  var overlay = document.getElementById('frameOverlay')
  if (frame.thumb_url) {
    var src = appUrl(frame.thumb_url)
    overlay.src = src
    overlay.style.display = 'block'
  } else {
    overlay.style.display = 'none'
  }

  document.getElementById('selectedFrameName').textContent = frame.name
  document.getElementById('noFrameHint').style.display     = 'none'
  document.getElementById('actionFrameName').textContent   = frame.name
  document.getElementById('nextBtn').disabled = false
}

function goToSelect() {
  if (!selectedFrame) { showToast('Pilih frame terlebih dahulu','error'); return }
  if (frameTimerHandle) { frameTimerHandle.stop(); frameTimerHandle = null }
  Session.setFrameID(selectedFrame.id)
  Session.set('frame_data', selectedFrame)
  navigate('select.html')
}