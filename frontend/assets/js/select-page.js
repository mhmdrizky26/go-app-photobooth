var session   = null
var frameData = null
var allPhotos = []
var selectedIDs = []
var selectedStripFilter = 'none'

var STRIP_FILTERS = {
  none: 'none',
  warm: 'saturate(1.2) contrast(1.08) hue-rotate(-14deg) sepia(0.18) brightness(1.03)',
  cool: 'saturate(1.12) contrast(1.06) hue-rotate(14deg) brightness(1.04)',
  mono: 'grayscale(1) contrast(1.14) brightness(1.02)',
  vivid: 'saturate(1.42) contrast(1.16) brightness(1.04)',
  soft: 'saturate(0.78) contrast(0.88) brightness(1.10)',
  sepia: 'sepia(0.62) saturate(1.22) contrast(1.02)',
  film: 'sepia(0.32) saturate(0.82) contrast(0.9) brightness(1.08)',
  dramatic: 'contrast(1.34) saturate(1.2) brightness(0.92)',
  pastel: 'saturate(0.68) contrast(0.84) brightness(1.14)',
  retro: 'sepia(0.34) hue-rotate(-18deg) saturate(1.34) contrast(1.10)'
}

var SELECT_TIMER      = 90
var selectTimerLeft   = SELECT_TIMER
var selectTimerHandle = null

window.addEventListener('DOMContentLoaded', async function() {
  session   = requireSession('category.html')
  frameData = Session.get('frame_data')
  if (!session)   { return }
  if (!frameData) { navigate('frame.html');    return }

  applyFrameTheme(frameData)
  var savedFilter = Session.get('strip_filter')
  if (savedFilter && STRIP_FILTERS[savedFilter]) {
    selectedStripFilter = savedFilter
  }

  var filterSelect = document.getElementById('stripFilterSelect')
  if (filterSelect) {
    filterSelect.value = selectedStripFilter
  }

  applyStripFilter()
  await loadPhotos()
  startSelectTimer()
})

function applyFrameTheme(frame) {
  document.getElementById('frameName').textContent = frame.name || 'Strip Foto'

  var tc = getThemeColors('theme-cream')
  var stripReal = document.getElementById('stripReal')
  stripReal.style.background = tc.bg
  document.querySelectorAll('#stripReal .strip-real-slot').forEach(function(s) {
    s.style.background = tc.slot
  })

  // Tampilkan frame PNG asli sebagai overlay
  if (frame.thumb_url) {
    var src = appUrl(frame.thumb_url)
    var overlay = document.getElementById('frameOverlay')
    overlay.src = src
    overlay.style.display = 'block'
  }
}

async function loadPhotos() {
  var grid = document.getElementById('photoGrid')
  try {
    allPhotos = await API.getSessionPhotos(session.id)
    grid.innerHTML = ''
    if (!allPhotos || allPhotos.length === 0) {
      grid.innerHTML = '<div class="photo-empty"><p>Belum ada foto.<br/><a href="photo.html" style="color:var(--gold)">Kembali ke sesi foto</a></p></div>'
      return
    }
    allPhotos.forEach(function(photo, i) { renderPhotoItem(photo, i) })
  } catch(err) {
    grid.innerHTML = '<div class="photo-empty"><p>Gagal memuat foto.</p></div>'
  }
}

function renderPhotoItem(photo, index) {
  var grid   = document.getElementById('photoGrid')
  var imgSrc = appUrl(photo.url)

  var item = document.createElement('div')
  item.className = 'photo-item animate-in'
  item.style.animationDelay = (index * 0.04) + 's'
  item.dataset.photoId = photo.id
  item.innerHTML =
    '<img src="'+imgSrc+'" alt="foto '+(index+1)+'" loading="lazy" />' +
    '<div class="photo-overlay"></div>' +
    '<div class="photo-position-badge" id="badge-'+photo.id+'"></div>' +
    '<button class="photo-remove-btn" onclick="removePhoto(event,\''+photo.id+'\')" title="Hapus">✕</button>'
  item.addEventListener('click', function() { togglePhoto(photo, item) })
  grid.appendChild(item)
}

function togglePhoto(photo, itemEl) {
  if (selectedIDs.includes(photo.id)) { removePhoto(null, photo.id); return }
  if (selectedIDs.length >= 3) { showToast('Maksimal 3 foto untuk strip','error'); return }
  selectedIDs.push(photo.id)
  itemEl.classList.add('selected')
  var badge = document.getElementById('badge-'+photo.id)
  if (badge) badge.textContent = selectedIDs.length
  updateStripPreview()
  updateUI()
}

function removePhoto(event, photoID) {
  if (event) event.stopPropagation()
  var pos = selectedIDs.indexOf(photoID)
  if (pos === -1) return
  selectedIDs.splice(pos, 1)
  var item = document.querySelector('[data-photo-id="'+photoID+'"]')
  if (item) item.classList.remove('selected')
  renumberBadges()
  updateStripPreview()
  updateUI()
}

function renumberBadges() {
  document.querySelectorAll('.photo-position-badge').forEach(function(b) { b.textContent='' })
  selectedIDs.forEach(function(id, i) {
    var badge = document.getElementById('badge-'+id)
    if (badge) badge.textContent = i+1
  })
}

function updateStripPreview() {
  var tc = getThemeColors('theme-cream')

  for (var i=1; i<=3; i++) {
    var slot    = document.getElementById('slot'+i)
    var photoID = selectedIDs[i-1]

    if (photoID) {
      var photo = allPhotos.find(function(p) { return p.id === photoID })
      if (photo) {
        var src = appUrl(photo.url)
        slot.innerHTML = '<img src="'+src+'" alt="slot '+i+'" /><span class="strip-slot-label">'+i+'</span>'
      }
    } else {
      slot.style.background = tc.slot
      slot.innerHTML =
        '<div class="strip-slot-empty">' +
          '<svg width="18" height="18" viewBox="0 0 20 20" fill="none">' +
            '<rect x="2" y="4" width="16" height="12" rx="2" stroke="#9b9d9c50" stroke-width="1.5"/>' +
            '<circle cx="10" cy="10" r="2.5" stroke="#9b9d9c50" stroke-width="1.5"/>' +
          '</svg>' +
          '<span class="strip-slot-empty-num">slot '+i+'</span>' +
        '</div>'
    }
  }

  applyStripFilter()
}

function changeStripFilter(filterKey) {
  selectedStripFilter = STRIP_FILTERS[filterKey] ? filterKey : 'none'
  Session.set('strip_filter', selectedStripFilter)
  applyStripFilter()
}

function applyStripFilter() {
  var value = STRIP_FILTERS[selectedStripFilter] || 'none'
  document.querySelectorAll('#stripReal .strip-real-slot').forEach(function(slot) {
    if (slot.querySelector('img')) {
      slot.style.filter = value
    } else {
      slot.style.filter = 'none'
    }
  })
}

function updateUI() {
  var count = selectedIDs.length
  document.getElementById('selectedCount').textContent = count
  document.getElementById('actionCount').textContent   = count
  for (var i=1;i<=3;i++) document.getElementById('dot'+i).classList.toggle('filled', i<=count)
  document.querySelectorAll('.photo-item').forEach(function(item) {
    var id = item.dataset.photoId
    item.classList.toggle('disabled', count>=3 && !selectedIDs.includes(id))
  })
  document.getElementById('composeBtn').disabled = count < 3
}

async function composeAndNext() {
  if (selectedIDs.length !== 3) { showToast('Pilih tepat 3 foto','error'); return }
  if (selectTimerHandle) { selectTimerHandle.stop(); selectTimerHandle = null }
  var btn = document.getElementById('composeBtn')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Menyusun strip...'
  try {
    Session.set('strip_filter', selectedStripFilter)
    var result = await API.composeFrame(session.id, frameData.id, selectedIDs, selectedStripFilter)
    Session.set('compose_result', result)
    Session.setSelectedPhotos(selectedIDs)
    navigate('download.html')
  } catch(err) {
    showToast('Gagal menyusun foto: '+err.message,'error')
    btn.disabled = false
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Buat Strip Foto'
  }
}

function startSelectTimer() {
  if (selectTimerHandle) selectTimerHandle.stop()
  selectTimerHandle = startCountdownTimer(SELECT_TIMER, function(remaining) {
    selectTimerLeft = remaining
    updateSelectTimerUI()
  }, autoCompose)
}
function updateSelectTimerUI() {
  var m = Math.floor(selectTimerLeft/60).toString().padStart(2,'0')
  var s = (selectTimerLeft%60).toString().padStart(2,'0')
  var el  = document.getElementById('selectTimerDisplay')
  var dot = document.getElementById('selectTimerDot')
  if (!el) return
  el.textContent = m+':'+s
  if (selectTimerLeft <= 20) { el.classList.add('warning'); if(dot) dot.classList.add('warning') }
}

async function autoCompose() {
  showToast('Waktu habis! Menyusun foto otomatis...','info')
  while (selectedIDs.length < 3 && selectedIDs.length < allPhotos.length) {
    var next = allPhotos.find(function(p) { return !selectedIDs.includes(p.id) })
    if (next) selectedIDs.push(next.id); else break
  }
  if (selectedIDs.length === 0) { navigate('frame.html'); return }
  while (selectedIDs.length < 3) selectedIDs.push(selectedIDs[0])
  await composeAndNext()
}