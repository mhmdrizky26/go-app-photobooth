// ─── API Helper ───────────────────────────────────────────────────────────────
const API_BASE =
  window.APP_API_BASE ||
  (window.APP_BASE_URL
    ? (window.APP_BASE_URL + '/api')
    : (window.location.protocol + '//' + (window.location.hostname || 'localhost') + ':8080/api'))

const API = {
  async request(method, path, body = null) {
    const opts = { method, headers: {} }
    if (body != null) {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }

    let res
    try {
      res = await fetch(`${API_BASE}${path}`, opts)
    } catch (err) {
      throw new Error('Tidak bisa terhubung ke server backend')
    }

    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch (err) {
      throw new Error('Respons server tidak valid')
    }

    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`)
    }
    if (!data || !data.success) {
      throw new Error((data && data.error) || 'Terjadi kesalahan')
    }
    return data.data
  },

  get(path)         { return this.request('GET', path) },
  post(path, body)  { return this.request('POST', path, body) },
  patch(path, body) { return this.request('PATCH', path, body) },
  delete(path)      { return this.request('DELETE', path) },

  // ── Endpoints ────────────────────────────────────────────────────────────
  getCategories()              { return this.get('/categories') },
  createSession(category)      { return this.post('/session/create', { category }) },
  getSession(id)               { return this.get(`/session/${id}`) },

  createPayment(sessionID)     { return this.post('/payment/create', { session_id: sessionID }) },
  getPaymentStatus(orderID)    { return this.get(`/payment/status/${orderID}`) },

  applyVoucher(sessionID, code) {
    return this.post('/voucher/apply', { session_id: sessionID, voucher_code: code })
  },
  removeVoucher(sessionID) {
    return this.post('/voucher/remove', { session_id: sessionID })
  },

  getFrames()                  { return this.get('/frames') },
  getGallery(sessionID)        { return this.get(`/gallery/${sessionID}`) },

  getSessionPhotos(sessionID)  { return this.get(`/photo/session/${sessionID}`) },
  getFramedPhotos(sessionID)   { return this.get(`/photo/session/${sessionID}/framed`) },

  selectPhotos(sessionID, photoIDs) {
    return this.post('/photo/select', { session_id: sessionID, photo_ids: photoIDs })
  },

  composeFrame(sessionID, frameID, photoIDs, stripFilter = 'none') {
    return this.post('/photo/compose', {
      session_id: sessionID,
      frame_id:   frameID,
      photo_ids:  photoIDs,
      strip_filter: stripFilter || 'none',
    })
  },

  // Upload foto via multipart form
  async uploadPhoto(sessionID, blob) {
    const form = new FormData()
    form.append('session_id', sessionID)
    form.append('photo', blob, `photo_${Date.now()}.jpg`)

    const res = await fetch(`${API_BASE}/photo/upload`, { method: 'POST', body: form })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Gagal upload foto')
    return data.data
  },
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  toast.textContent = message
  container.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = '0.3s'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

function navigate(page) {
  window.location.href = page
}

function formatRupiah(n) {
  return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}