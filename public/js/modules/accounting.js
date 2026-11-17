let allTransactions = [];
let currentTxFilter = 'Semua';

async function loadTransactions() {
  try {
    const [txRes, repRes] = await Promise.all([
      API.get('/api/accounting/transactions'),
      API.get('/api/accounting/report')
    ]);

    if (txRes.success) {
      allTransactions = txRes.data;
      renderTransactionsTable();
    }

    if (repRes.success) {
      const rep = repRes.data;
      document.getElementById('acc-sum-income').textContent = formatRupiah(rep.total_income);
      document.getElementById('acc-sum-expense').textContent = formatRupiah(rep.total_expense);
      document.getElementById('acc-sum-profit').textContent = formatRupiah(rep.net_profit);
    }
  } catch (err) {
    showToast('Gagal memuat data akuntansi: ' + err.message, 'error');
  }
}

function filterTransactions(type) {
  currentTxFilter = type;
  document.querySelectorAll('.tx-filter-btn').forEach(btn => {
    btn.className = 'tx-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-transparent';
  });
  const activeBtn = document.getElementById(`tx-filter-${type}`);
  if (activeBtn) {
    activeBtn.className = 'tx-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200';
  }
  renderTransactionsTable();
}

function applyTxFilters() {
  renderTransactionsTable();
}

function renderTransactionsTable() {
  const tbody = document.getElementById('accounting-table-body');
  if (!tbody) return;

  const categoryFilter = document.getElementById('tx-category-filter')?.value || 'Semua';

  let list = allTransactions;
  if (currentTxFilter !== 'Semua') {
    list = list.filter(t => t.type === currentTxFilter);
  }
  if (categoryFilter !== 'Semua') {
    list = list.filter(t => t.category === categoryFilter);
  }

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-receipt text-3xl mb-2 text-slate-300 block"></i>
          Tidak ada transaksi kas tercatat
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(t => {
    const isIncome = t.type === 'Pemasukan';
    const typeBadge = isIncome
      ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-arrow-down-left text-[9px]"></i> Pemasukan</span>'
      : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-arrow-up-right text-[9px]"></i> Pengeluaran</span>';

    const amtSign = isIncome ? '+' : '-';
    const amtColor = isIncome ? 'text-emerald-600' : 'text-rose-600';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3.5 px-4 font-mono text-slate-700">${formatDate(t.date)}</td>
        <td class="py-3.5 px-4">${typeBadge}</td>
        <td class="py-3.5 px-4">
          <div class="font-bold text-slate-800">${escapeHtml(t.description)}</div>
          <div class="text-[11px] text-slate-500 font-medium">Kategori: ${escapeHtml(t.category)} ${t.reference ? `&bull; Ref: ${escapeHtml(t.reference)}` : ''}</div>
        </td>
        <td class="py-3.5 px-4 text-slate-600">
          <span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium border border-slate-200">
            ${escapeHtml(t.payment_method || 'Kas Tunai')}
          </span>
        </td>
        <td class="py-3.5 px-4 text-right font-mono font-bold ${amtColor}">
          ${amtSign} ${formatRupiah(t.amount)}
        </td>
        <td class="py-3.5 px-4 text-center">
          <button onclick="deleteTransactionPrompt('${t.id}')" title="Hapus Transaksi" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openCreateTransactionModal(preferredType = 'Pemasukan') {
  document.getElementById('form-transaction').reset();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('tx-form-date').value = today;

  // Set radio
  const radios = document.getElementsByName('tx-type');
  for (const r of radios) {
    if (r.value === preferredType) r.checked = true;
  }

  // Adjust default category
  const catSelect = document.getElementById('tx-form-category');
  if (preferredType === 'Pemasukan') {
    catSelect.value = 'Pembayaran Faktur';
  } else {
    catSelect.value = 'Beban Gaji Karyawan';
  }

  openModal('modal-transaction-form');
}

async function handleSaveTransaction(e) {
  e.preventDefault();

  let selectedType = 'Pemasukan';
  const radios = document.getElementsByName('tx-type');
  for (const r of radios) {
    if (r.checked) selectedType = r.value;
  }

  const payload = {
    type: selectedType,
    date: document.getElementById('tx-form-date').value,
    category: document.getElementById('tx-form-category').value,
    amount: parseFloat(document.getElementById('tx-form-amount').value) || 0,
    description: document.getElementById('tx-form-description').value.trim(),
    payment_method: document.getElementById('tx-form-payment-method').value,
    reference: document.getElementById('tx-form-reference').value.trim()
  };

  try {
    await API.post('/api/accounting/transactions', payload);
    showToast('Transaksi kas berhasil dicatat!', 'success');
    closeModal('modal-transaction-form');
    loadTransactions();
    loadDashboard();
  } catch (err) {
    showToast('Gagal mencatat transaksi: ' + err.message, 'error');
  }
}

async function deleteTransactionPrompt(id) {
  if (!confirm('Hapus pencatatan transaksi kas ini?')) return;
  try {
    await API.delete(`/api/accounting/transactions/${id}`);
    showToast('Transaksi telah dihapus', 'success');
    loadTransactions();
    loadDashboard();
  } catch (err) {
    showToast('Gagal menghapus transaksi: ' + err.message, 'error');
  }
}
