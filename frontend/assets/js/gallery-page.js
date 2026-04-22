window.addEventListener('DOMContentLoaded', function() {
  var sessionID = getSessionIDFromURL()

  if (!sessionID) {
    renderError('Link Tidak Valid', 'Session ID tidak ditemukan pada link.')
    return
  }

  loadGallery(sessionID)
})

async function loadGallery(sessionID) {
  try {
    var data = await API.getGallery(sessionID)
    renderGallery(data)
  } catch (err) {
    renderError('Gallery Tidak Tersedia', err.message || 'Gagal memuat gallery.')
  }
}

function renderGallery(data) {
  var expiresText = formatDateID(data.expires_at)

  var expiry = document.getElementById('metaExpiry')
  if (expiry) expiry.textContent = expiresText

  var packageEl = document.getElementById('infoPackage')
  if (packageEl) packageEl.textContent = data.category === 'vip' ? 'VIP' : 'Regular'

  var frameEl = document.getElementById('infoFrame')
  if (frameEl) frameEl.textContent = data.frame_name || '-'

  var countEl = document.getElementById('infoCount')
  if (countEl) countEl.textContent = String(data.photo_count || 0) + ' foto'

  var expiryEl = document.getElementById('infoExpiry')
  if (expiryEl) expiryEl.textContent = expiresText

  var warnEl = document.getElementById('expiryWarn')
  if (warnEl) warnEl.textContent = 'Link ini akan otomatis tidak aktif pada ' + expiresText

  var stripWrap = document.getElementById('stripWrap')
  var stripDownload = document.getElementById('stripDownload')
  if (data.framed_photo) {
    stripWrap.innerHTML = '<img src="' + appUrl(data.framed_photo.url) + '" alt="Strip foto" loading="lazy"/>'
    stripDownload.href = appUrl(data.framed_photo.download_url)
    stripDownload.style.display = 'flex'
  } else {
    stripWrap.innerHTML = '<div class="strip-placeholder">Strip belum tersedia</div>'
    stripDownload.style.display = 'none'
  }

  var grid = document.getElementById('photoGrid')
  if (!grid) return

  var photos = data.raw_photos || []
  if (photos.length === 0) {
    grid.innerHTML = '<div class="empty">Belum ada foto yang dipilih.</div>'
    return
  }

  grid.innerHTML = photos.map(function(photo) {
    return (
      '<div class="photo-card">' +
        '<div class="photo-thumb">' +
          '<img src="' + appUrl(photo.url) + '" alt="Foto ' + photo.number + '" loading="lazy" />' +
          '<span class="photo-num">' + photo.number + '</span>' +
        '</div>' +
        '<a href="' + appUrl(photo.download_url) + '" class="btn-dl" download>' +
          '<svg width="13" height="13" viewBox="0 0 16 16" fill="none">' +
            '<path d="M8 2v9M4 7l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M2 13h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
          '</svg>' +
          'Download' +
        '</a>' +
      '</div>'
    )
  }).join('')
}

function renderError(title, message) {
  document.body.innerHTML =
    '<main class="error-wrap">' +
      '<h1>' + escapeHtml(title) + '</h1>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<a class="back-link" href="index.html">Kembali ke Home</a>' +
    '</main>'
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getSessionIDFromURL() {
  var params = new URLSearchParams(window.location.search)
  var querySessionID = params.get('session_id')
  if (querySessionID) return querySessionID

  var pathParts = window.location.pathname.split('/').filter(Boolean)
  var galleryIndex = pathParts.lastIndexOf('gallery')
  if (galleryIndex !== -1 && pathParts[galleryIndex + 1]) {
    return decodeURIComponent(pathParts[galleryIndex + 1])
  }
  return ''
}

function formatDateID(value) {
  if (!value) return '-'
  var date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
