let selectedCategory = null

function selectCategory(el, category) {
  // Reset semua card
  document.querySelectorAll('.category-card').forEach(c => {
    c.classList.remove('selected')
  })

  // Set yang dipilih
  el.classList.add('selected')
  selectedCategory = category

  // Update label
  const labels = {
    regular: 'Regular — Rp 35.000 / 5 menit',
    vip:     'VIP — Rp 45.000 / 8 menit',
  }
  document.getElementById('selectedLabel').textContent = labels[category]

  // Enable tombol next
  document.getElementById('nextBtn').disabled = false
}

async function goToPayment() {
  if (!selectedCategory) return

  const btn = document.getElementById('nextBtn')
  btn.disabled = true
  btn.innerHTML = `<span class="spinner"></span> Membuat sesi...`

  try {
    const session = await API.createSession(selectedCategory)
    Session.setSession(session)
    navigate('payment.html')
  } catch (err) {
    showToast(err.message || 'Gagal membuat sesi', 'error')
    btn.disabled = false
    btn.innerHTML = `Lanjut ke Pembayaran
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
  }
}