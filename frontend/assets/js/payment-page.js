// ─── State ─────────────────────────────────────────────────────────────
let session       = null
let orderID       = null
let pollingTimer  = null
let countdownTimer = null
let secondsLeft   = 15 * 60 // 15 menit QRIS timeout

// ─── Init ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  session = requireSession('category.html')
  if (!session) return

  // Tampilkan summary
  renderSummary(session)

  // Buat QRIS
  await createPayment()
})

// ─── Render Summary ────────────────────────────────────────────────────
function renderSummary(s) {
  document.getElementById('sessionIDDisplay').textContent = s.id
  document.getElementById('summaryCategory').textContent =
    s.category === 'vip' ? 'VIP' : 'Regular'
  document.getElementById('summaryDuration').textContent =
    s.duration_secs === 480 ? '8 menit' : '5 menit'
  document.getElementById('summaryPrice').textContent =
    formatRupiah(s.price)
  document.getElementById('summaryTotal').textContent =
    formatRupiah(s.final_price)

  if (s.discount > 0) {
    document.getElementById('discountRow').style.display = 'flex'
    document.getElementById('summaryDiscount').textContent =
      '− ' + formatRupiah(s.discount)
  }
}

// ─── Create Payment ────────────────────────────────────────────────────
async function createPayment() {
  // Reset UI
  stopPolling()
  stopCountdown()
  showQRISState('loading')
  document.getElementById('refreshBtn').style.display = 'none'

  try {
    const result = await API.createPayment(session.id)
    orderID = result.transaction.midtrans_order_id

    Session.setOrderID(orderID)
    Session.setTransaction(result.transaction)

    // Pembayaran gratis (voucher 100%): backend langsung set paid.
    if (result.transaction.status === 'paid' || result.transaction.amount === 0) {
      showQRISState('paid')
      session.status = 'paid'
      session.final_price = result.session.final_price
      Session.setSession(session)
      setTimeout(() => navigate('photo.html'), 1200)
      return
    }

    // Tampilkan QR image
    if (result.transaction.qris_url) {
      const img = document.getElementById('qrisImage')
      img.src = result.transaction.qris_url
      img.onload = () => showQRISState('qr')
      img.onerror = () => showQRISState('qr') // tetap tampilkan
    } else {
      showQRISState('qr')
    }

    // Mulai polling & countdown
    startPolling()
    startCountdown()

  } catch (err) {
    showToast('Gagal membuat QRIS: ' + err.message, 'error')
    showQRISState('loading')
  }
}

// ─── QRIS State ────────────────────────────────────────────────────────
function showQRISState(state) {
  document.getElementById('qrisLoading').style.display  = 'none'
  document.getElementById('qrisImage').style.display    = 'none'
  document.getElementById('qrisPaid').style.display     = 'none'
  document.getElementById('qrisExpired').style.display  = 'none'
  document.getElementById('pollingStatus').style.display = 'none'
  document.getElementById('qrisTimer').style.display    = 'none'

  if (state === 'loading') {
    document.getElementById('qrisLoading').style.display = 'flex'
  } else if (state === 'qr') {
    document.getElementById('qrisImage').style.display    = 'block'
    document.getElementById('pollingStatus').style.display = 'flex'
    document.getElementById('qrisTimer').style.display    = 'block'
  } else if (state === 'paid') {
    document.getElementById('qrisPaid').style.display = 'flex'
    document.getElementById('paymentStatusLabel').textContent = '✓ Lunas'
    document.getElementById('paymentStatusLabel').style.color = 'var(--success)'
  } else if (state === 'expired') {
    document.getElementById('qrisExpired').style.display = 'flex'
    document.getElementById('refreshBtn').style.display  = 'block'
  }
}

// ─── Polling ───────────────────────────────────────────────────────────
function startPolling() {
  pollingTimer = setInterval(async () => {
    if (!orderID) return
    try {
      const result = await API.getPaymentStatus(orderID)
      if (result.paid) {
        stopPolling()
        stopCountdown()
        showQRISState('paid')

        // Update session di storage
        const updatedSession = await API.getSession(session.id)
        Session.setSession(updatedSession)

        // Redirect ke halaman foto setelah 2 detik
        setTimeout(() => navigate('photo.html'), 2000)
      }
    } catch (err) {
      console.warn('Polling error:', err)
    }
  }, 3000) // setiap 3 detik
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// ─── Countdown Timer ───────────────────────────────────────────────────
function startCountdown() {
  if (countdownTimer) countdownTimer.stop()
  countdownTimer = startCountdownTimer(15 * 60, (remaining) => {
    secondsLeft = remaining
    updateTimerDisplay()
  }, () => {
    stopPolling()
    showQRISState('expired')
  })
}

function stopCountdown() {
  if (countdownTimer) {
    countdownTimer.stop()
    countdownTimer = null
  }
}

function updateTimerDisplay() {
  const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const s = (secondsLeft % 60).toString().padStart(2, '0')
  document.getElementById('timerDisplay').textContent = `${m}:${s}`
}

// ─── Voucher ───────────────────────────────────────────────────────────
async function applyVoucher() {
  const code = document.getElementById('voucherInput').value.trim()
  if (!code) return

  const btn = document.getElementById('voucherBtn')
  btn.disabled = true
  btn.textContent = '...'

  const resultEl = document.getElementById('voucherResult')
  resultEl.className = 'voucher-result'
  resultEl.style.display = 'none'

  try {
    const result = await API.applyVoucher(session.id, code)

    if (result.valid) {
      resultEl.className = 'voucher-result success'
      resultEl.textContent = '✓ ' + result.message
      resultEl.style.display = 'flex'

      // Update session & tampilan
      session.discount    = result.discount_amount
      session.final_price = result.final_price
      Session.setSession(session)

      // Update UI summary
      document.getElementById('summaryTotal').textContent =
        formatRupiah(result.final_price)
      document.getElementById('discountRow').style.display = 'flex'
      document.getElementById('summaryDiscount').textContent =
        '− ' + formatRupiah(result.discount_amount)

      // Buat ulang QRIS dengan harga baru
      showToast('Voucher digunakan! Membuat QRIS baru...', 'info')
      setTimeout(() => createPayment(), 1000)

    } else {
      resultEl.className = 'voucher-result error'
      resultEl.textContent = '✗ ' + result.message
      resultEl.style.display = 'flex'
    }

  } catch (err) {
    resultEl.className = 'voucher-result error'
    resultEl.textContent = '✗ ' + (err.message || 'Gagal memeriksa voucher')
    resultEl.style.display = 'flex'
  }

  btn.disabled = false
  btn.textContent = 'Pakai'
}

// Bersihkan timer saat pindah halaman
window.addEventListener('beforeunload', () => {
  stopPolling()
  stopCountdown()
})