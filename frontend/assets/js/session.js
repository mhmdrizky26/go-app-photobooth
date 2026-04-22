// ─── Session State Manager ───────────────────────────────────────────────────
// Semua state disimpan di sessionStorage agar hilang saat tab ditutup

const Session = {
  // Simpan data
  set(key, value) {
    sessionStorage.setItem(`pb_${key}`, JSON.stringify(value))
  },

  // Ambil data
  get(key) {
    const val = sessionStorage.getItem(`pb_${key}`)
    try { return val ? JSON.parse(val) : null }
    catch { return val }
  },

  // Hapus satu key
  remove(key) {
    sessionStorage.removeItem(`pb_${key}`)
  },

  // Hapus semua state photobooth
  clear() {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('pb_'))
      .forEach(k => sessionStorage.removeItem(k))
  },

  // Shortcut untuk data sesi utama
  getSession()      { return this.get('session') },
  setSession(s)     { this.set('session', s) },
  getOrderID()      { return this.get('order_id') },
  setOrderID(id)    { this.set('order_id', id) },
  getTransaction()  { return this.get('transaction') },
  setTransaction(t) { this.set('transaction', t) },
  getFrameID()      { return this.get('frame_id') },
  setFrameID(id)    { this.set('frame_id', id) },
  getSelectedPhotos()     { return this.get('selected_photos') || [] },
  setSelectedPhotos(ids)  { this.set('selected_photos', ids) },
}