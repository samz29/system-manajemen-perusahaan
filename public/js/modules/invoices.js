let allInvoices = [];
let currentInvoiceFilter = 'Semua';
let invoiceSearchQuery = '';

async function loadInvoices() {
  try {
    const res = await API.get('/api/invoices');
    if (!res.success) return;
    allInvoices = res.data;
    renderInvoicesTable();
  } catch (err) {
    showToast('Gagal memuat faktur: ' + err.message, 'error');
  }
}

function filterInvoices(status) {
  currentInvoiceFilter = status;
  document.querySelectorAll('.inv-filter-btn').forEach(btn => {
    btn.className = 'inv-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-transparent';
  });
  const activeBtn = document.getElementById(`inv-filter-${status.replace(' ', '-')}`);
  if (activeBtn) {
    activeBtn.className = 'inv-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200';
  }
  renderInvoicesTable();
}

function searchInvoices(query) {
  invoiceSearchQuery = (query || '').toLowerCase().trim();
  renderInvoicesTable();
}

function renderInvoicesTable() {
  const tbody = document.getElementById('invoices-table-body');
  if (!tbody) return;

  let filtered = allInvoices;
  if (currentInvoiceFilter !== 'Semua') {
    filtered = filtered.filter(i => i.status === currentInvoiceFilter);
  }
  if (invoiceSearchQuery) {
    filtered = filtered.filter(i => 
      (i.invoice_number && i.invoice_number.toLowerCase().includes(invoiceSearchQuery)) ||
      (i.client?.name && i.client.name.toLowerCase().includes(invoiceSearchQuery)) ||
      (i.client?.email && i.client.email.toLowerCase().includes(invoiceSearchQuery))
    );
  }

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-file-invoice text-3xl mb-2 text-slate-300 block"></i>
          Tidak ada faktur ditemukan
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(inv => {
    let statusBadge = '';
    if (inv.status === 'Lunas') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check text-[9px]"></i> Lunas</span>';
    } else if (inv.status === 'Terkirim') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-regular fa-paper-plane text-[9px]"></i> Terkirim</span>';
    } else if (inv.status === 'Jatuh Tempo') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-triangle-exclamation text-[9px]"></i> Jatuh Tempo</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">Draft</span>';
    }

    const isPaid = inv.status === 'Lunas';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
          ${escapeHtml(inv.invoice_number)}
          <div class="text-[10px] text-slate-400 font-sans font-normal">${inv.items?.length || 0} item barang/jasa</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-bold text-slate-800">${escapeHtml(inv.client.name)}</div>
          <div class="text-[11px] text-slate-500">${escapeHtml(inv.client.attn || inv.client.email || '-')}</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="text-slate-700">Tgl: ${formatDate(inv.date)}</div>
          <div class="text-[11px] text-slate-400">Tempo: ${formatDate(inv.due_date)}</div>
        </td>
        <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
          ${formatRupiah(inv.grand_total)}
        </td>
        <td class="py-3.5 px-4 text-center">
          ${statusBadge}
        </td>
        <td class="py-3.5 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="previewInvoice('${inv.id}')" title="Pratinjau & Cetak A4" class="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <i class="fa-solid fa-print"></i>
            </button>
            ${!isPaid ? `
              <button onclick="markInvoicePaid('${inv.id}')" title="Tandai Sudah Lunas" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                <i class="fa-solid fa-circle-check"></i>
              </button>
            ` : ''}
            <button onclick="openEditInvoiceModal('${inv.id}')" title="Edit Faktur" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deleteInvoicePrompt('${inv.id}')" title="Hapus" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Line items builder inside Invoice modal
let invoiceItemCounter = 0;

function addInvoiceItemRow(item = null) {
  invoiceItemCounter++;
  const rowId = `item-row-${invoiceItemCounter}`;
  const tbody = document.getElementById('inv-items-body');

  const desc = item ? escapeHtml(item.description) : '';
  const qty = item ? item.quantity : 1;
  const unit = item ? escapeHtml(item.unit) : 'Unit';
  const price = item ? item.unit_price : 0;
  const disc = item ? item.discount_percent : 0;
  const lineTotal = qty * price * (1 - disc / 100);

  const tr = document.createElement('tr');
  tr.id = rowId;
  tr.className = 'hover:bg-slate-50/50';
  tr.innerHTML = `
    <td class="p-2">
      <input type="text" class="item-desc w-full border border-slate-200 rounded px-2 py-1 text-xs" required placeholder="Nama barang / jasa" value="${desc}">
    </td>
    <td class="p-2">
      <input type="number" class="item-qty w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono text-center" min="1" step="1" value="${qty}" oninput="recalcInvoiceFormTotals()">
    </td>
    <td class="p-2">
      <input type="text" class="item-unit w-full border border-slate-200 rounded px-2 py-1 text-xs text-center" placeholder="Unit/Bln/Jam" value="${unit}">
    </td>
    <td class="p-2">
      <input type="number" class="item-price w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" min="0" value="${price}" oninput="recalcInvoiceFormTotals()">
    </td>
    <td class="p-2">
      <input type="number" class="item-disc w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono text-center" min="0" max="100" value="${disc}" oninput="recalcInvoiceFormTotals()">
    </td>
    <td class="p-2 text-right font-mono font-semibold text-slate-800 item-linetotal">
      ${formatRupiah(lineTotal)}
    </td>
    <td class="p-2 text-center">
      <button type="button" onclick="removeInvoiceItemRow('${rowId}')" class="text-slate-400 hover:text-rose-600 p-1">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  recalcInvoiceFormTotals();
}

function removeInvoiceItemRow(rowId) {
  const tr = document.getElementById(rowId);
  if (tr) tr.remove();
  recalcInvoiceFormTotals();
}

function recalcInvoiceFormTotals() {
  const rows = document.querySelectorAll('#inv-items-body tr');
  let subtotal = 0;

  rows.forEach(r => {
    const qty = parseFloat(r.querySelector('.item-qty')?.value) || 0;
    const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
    const disc = parseFloat(r.querySelector('.item-disc')?.value) || 0;
    const lineTotal = qty * price * (1 - disc / 100);
    const lineTotalEl = r.querySelector('.item-linetotal');
    if (lineTotalEl) lineTotalEl.textContent = formatRupiah(lineTotal);
    subtotal += lineTotal;
  });

  const discountAmount = parseFloat(document.getElementById('inv-calc-discount')?.value) || 0;
  const taxRate = parseFloat(document.getElementById('inv-calc-tax-rate')?.value) || 0;

  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxable * taxRate) / 100;
  const grandTotal = taxable + taxAmount;

  document.getElementById('inv-calc-subtotal').textContent = formatRupiah(subtotal);
  document.getElementById('inv-calc-tax-amount').textContent = formatRupiah(taxAmount);
  document.getElementById('inv-calc-grand-total').textContent = formatRupiah(grandTotal);
}

function openCreateInvoiceModal() {
  document.getElementById('invoice-modal-title').textContent = 'Buat Faktur Penjualan Baru';
  document.getElementById('inv-edit-id').value = '';
  document.getElementById('inv-form-number').value = '';
  
  const today = new Date().toISOString().split('T')[0];
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  document.getElementById('inv-form-date').value = today;
  document.getElementById('inv-form-due-date').value = dueDate;
  
  document.getElementById('inv-client-name').value = '';
  document.getElementById('inv-client-attn').value = '';
  document.getElementById('inv-client-email').value = '';
  document.getElementById('inv-client-phone').value = '';
  document.getElementById('inv-client-address').value = '';

  document.getElementById('inv-form-notes').value = 'Pembayaran dapat ditransfer ke rekening resmi kami sebelum tanggal jatuh tempo.';
  document.getElementById('inv-form-status').value = 'Terkirim';
  document.getElementById('inv-calc-discount').value = 0;
  document.getElementById('inv-calc-tax-rate').value = 11;

  const tbody = document.getElementById('inv-items-body');
  tbody.innerHTML = '';
  addInvoiceItemRow(); // Add 1 empty row

  openModal('modal-invoice-form');
}

function openEditInvoiceModal(id) {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;

  document.getElementById('invoice-modal-title').textContent = `Edit Faktur: ${inv.invoice_number}`;
  document.getElementById('inv-edit-id').value = inv.id;
  document.getElementById('inv-form-number').value = inv.invoice_number;
  document.getElementById('inv-form-date').value = inv.date;
  document.getElementById('inv-form-due-date').value = inv.due_date;

  document.getElementById('inv-client-name').value = inv.client.name || '';
  document.getElementById('inv-client-attn').value = inv.client.attn || '';
  document.getElementById('inv-client-email').value = inv.client.email || '';
  document.getElementById('inv-client-phone').value = inv.client.phone || '';
  document.getElementById('inv-client-address').value = inv.client.address || '';

  document.getElementById('inv-form-notes').value = inv.notes || '';
  document.getElementById('inv-form-status').value = inv.status;
  document.getElementById('inv-calc-discount').value = inv.discount_amount || 0;
  document.getElementById('inv-calc-tax-rate').value = inv.tax_rate !== undefined ? inv.tax_rate : 11;

  const tbody = document.getElementById('inv-items-body');
  tbody.innerHTML = '';
  (inv.items || []).forEach(item => addInvoiceItemRow(item));
  if (!inv.items || !inv.items.length) addInvoiceItemRow();

  openModal('modal-invoice-form');
}

async function handleSaveInvoice(e) {
  e.preventDefault();
  const id = document.getElementById('inv-edit-id').value;

  const rows = document.querySelectorAll('#inv-items-body tr');
  const items = [];
  rows.forEach((r, idx) => {
    const desc = r.querySelector('.item-desc')?.value.trim();
    if (desc) {
      items.push({
        id: `item-${idx + 1}`,
        description: desc,
        quantity: parseFloat(r.querySelector('.item-qty')?.value) || 1,
        unit: r.querySelector('.item-unit')?.value.trim() || 'Unit',
        unit_price: parseFloat(r.querySelector('.item-price')?.value) || 0,
        discount_percent: parseFloat(r.querySelector('.item-disc')?.value) || 0
      });
    }
  });

  if (!items.length) {
    showToast('Harap tambahkan minimal satu baris barang/jasa!', 'error');
    return;
  }

  const payload = {
    invoice_number: document.getElementById('inv-form-number').value.trim() || undefined,
    date: document.getElementById('inv-form-date').value,
    due_date: document.getElementById('inv-form-due-date').value,
    status: document.getElementById('inv-form-status').value,
    client: {
      name: document.getElementById('inv-client-name').value.trim(),
      attn: document.getElementById('inv-client-attn').value.trim(),
      email: document.getElementById('inv-client-email').value.trim(),
      phone: document.getElementById('inv-client-phone').value.trim(),
      address: document.getElementById('inv-client-address').value.trim()
    },
    items,
    discount_amount: parseFloat(document.getElementById('inv-calc-discount').value) || 0,
    tax_rate: parseFloat(document.getElementById('inv-calc-tax-rate').value) || 0,
    notes: document.getElementById('inv-form-notes').value.trim()
  };

  try {
    if (id) {
      await API.put(`/api/invoices/${id}`, payload);
      showToast('Faktur berhasil diperbarui', 'success');
    } else {
      await API.post('/api/invoices', payload);
      showToast('Faktur berhasil diterbitkan!', 'success');
    }
    closeModal('modal-invoice-form');
    loadInvoices();
    loadDashboard();
    loadTransactions();
  } catch (err) {
    showToast('Gagal menyimpan faktur: ' + err.message, 'error');
  }
}

async function markInvoicePaid(id) {
  if (!confirm('Tandai faktur ini sebagai LUNAS? Pembayaran akan otomatis dicatat sebagai kas masuk di modul Akuntansi.')) return;
  try {
    await API.post(`/api/invoices/${id}/pay`, {
      payment_method: 'Transfer Bank',
      payment_date: new Date().toISOString().split('T')[0]
    });
    showToast('Faktur lunas & tercatat dalam kas masuk akuntansi!', 'success');
    loadInvoices();
    loadDashboard();
    loadTransactions();
  } catch (err) {
    showToast('Gagal menandai lunas: ' + err.message, 'error');
  }
}

async function deleteInvoicePrompt(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus faktur ini? Tindakan tidak dapat dibatalkan.')) return;
  try {
    await API.delete(`/api/invoices/${id}`);
    showToast('Faktur telah dihapus', 'success');
    loadInvoices();
    loadDashboard();
  } catch (err) {
    showToast('Gagal menghapus faktur: ' + err.message, 'error');
  }
}

// Professional A4 Printable Invoice View
async function previewInvoice(id) {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;

  const compRes = await API.get('/api/company');
  const comp = compRes.data || {};

  const card = document.getElementById('invoice-print-card');

  let stampHtml = '';
  if (inv.status === 'Lunas') {
    stampHtml = `<div class="stamp stamp-paid"><i class="fa-solid fa-stamp mr-1"></i> LUNAS / PAID</div>`;
  } else if (inv.status === 'Jatuh Tempo') {
    stampHtml = `<div class="stamp" style="color: #dc2626; border-color: #dc2626;"><i class="fa-solid fa-circle-exclamation mr-1"></i> OVERDUE</div>`;
  } else if (inv.status === 'Terkirim') {
    stampHtml = `<div class="stamp stamp-pending"><i class="fa-solid fa-paper-plane mr-1"></i> TAGIHAN</div>`;
  }

  const itemsRows = (inv.items || []).map((it, idx) => `
    <tr class="border-b border-slate-200">
      <td class="py-3 px-3 text-center text-slate-500">${idx + 1}</td>
      <td class="py-3 px-3">
        <div class="font-bold text-slate-800">${escapeHtml(it.description)}</div>
      </td>
      <td class="py-3 px-3 text-center">${it.quantity} ${escapeHtml(it.unit || '')}</td>
      <td class="py-3 px-3 text-right font-mono">${formatRupiah(it.unit_price)}</td>
      <td class="py-3 px-3 text-center font-mono">${it.discount_percent > 0 ? it.discount_percent + '%' : '-'}</td>
      <td class="py-3 px-3 text-right font-mono font-bold">${formatRupiah(it.total)}</td>
    </tr>
  `).join('');

  card.innerHTML = `
    <!-- Company Header / Kop Surat -->
    <div class="flex justify-between items-start border-b-2 border-slate-900 pb-5">
      <div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <i class="fa-solid fa-building-columns text-sm"></i>
          </div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight uppercase">${escapeHtml(comp.name)}</h1>
        </div>
        <p class="text-slate-600 text-[11px] mt-1 max-w-sm">${escapeHtml(comp.address || '')}</p>
        <p class="text-slate-500 text-[11px] mt-0.5">Telp: ${escapeHtml(comp.phone || '')} &bull; Email: ${escapeHtml(comp.email || '')}</p>
        ${comp.npwp ? `<p class="text-slate-500 text-[11px]">NPWP: ${escapeHtml(comp.npwp)}</p>` : ''}
      </div>

      <div class="text-right">
        <h2 class="text-2xl font-black text-blue-700 tracking-wider uppercase">FAKTUR TAGIHAN</h2>
        <div class="font-mono font-bold text-slate-900 text-sm mt-1">${inv.invoice_number}</div>
        <div class="mt-2">${stampHtml}</div>
      </div>
    </div>

    <!-- Meta Details Grid -->
    <div class="grid grid-cols-2 gap-6 my-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
      <div>
        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ditagihkan Kepada:</div>
        <div class="font-bold text-slate-900 text-sm mt-1">${escapeHtml(inv.client.name)}</div>
        ${inv.client.attn ? `<div class="text-slate-700 mt-0.5">Attn: ${escapeHtml(inv.client.attn)}</div>` : ''}
        ${inv.client.address ? `<div class="text-slate-600 mt-0.5">${escapeHtml(inv.client.address)}</div>` : ''}
        ${inv.client.phone ? `<div class="text-slate-500 mt-0.5">Telp: ${escapeHtml(inv.client.phone)}</div>` : ''}
        ${inv.client.email ? `<div class="text-slate-500 mt-0.5">Email: ${escapeHtml(inv.client.email)}</div>` : ''}
      </div>

      <div class="text-right space-y-1">
        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Informasi Transaksi:</div>
        <div class="text-slate-700 mt-1"><span class="text-slate-500">Tanggal Faktur:</span> <span class="font-semibold text-slate-900">${formatDate(inv.date)}</span></div>
        <div class="text-slate-700"><span class="text-slate-500">Jatuh Tempo:</span> <span class="font-semibold text-rose-600">${formatDate(inv.due_date)}</span></div>
        ${inv.payment_date ? `<div class="text-emerald-700 font-semibold"><span class="text-slate-500">Tgl Pelunasan:</span> ${formatDate(inv.payment_date)}</div>` : ''}
        ${inv.payment_method ? `<div class="text-slate-600 text-[11px]">${escapeHtml(inv.payment_method)}</div>` : ''}
      </div>
    </div>

    <!-- Items Table -->
    <table class="w-full border-collapse mb-6 text-xs">
      <thead>
        <tr class="bg-slate-900 text-white font-semibold uppercase tracking-wider">
          <th class="py-2.5 px-3 w-10 text-center">No</th>
          <th class="py-2.5 px-3 text-left">Deskripsi Barang / Layanan</th>
          <th class="py-2.5 px-3 w-24 text-center">Kuantitas</th>
          <th class="py-2.5 px-3 w-32 text-right">Harga Satuan</th>
          <th class="py-2.5 px-3 w-20 text-center">Diskon</th>
          <th class="py-2.5 px-3 w-36 text-right">Jumlah (Rp)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- Totals & Banking Info -->
    <div class="grid grid-cols-2 gap-8 items-start my-6">
      <div>
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div class="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
            <i class="fa-solid fa-credit-card text-blue-600"></i> Rekening Resmi Pembayaran:
          </div>
          <div class="text-slate-700 font-medium">Bank: <span class="font-bold text-slate-900">${escapeHtml(comp.bank_name || 'BCA')}</span></div>
          <div class="text-slate-700 font-medium">No. Rekening: <span class="font-mono font-bold text-slate-900">${escapeHtml(comp.bank_account_number || '-')}</span></div>
          <div class="text-slate-700 font-medium">Atas Nama: <span class="font-bold text-slate-900">${escapeHtml(comp.bank_account_holder || comp.name)}</span></div>
        </div>

        ${inv.notes ? `
          <div class="mt-3 text-slate-500 text-[11px]">
            <span class="font-bold text-slate-700">Catatan:</span> ${escapeHtml(inv.notes)}
          </div>
        ` : ''}
      </div>

      <div class="space-y-2 text-xs">
        <div class="flex justify-between py-1 border-b border-slate-100 text-slate-600">
          <span>Subtotal:</span>
          <span class="font-mono font-semibold">${formatRupiah(inv.subtotal)}</span>
        </div>
        ${inv.discount_amount > 0 ? `
          <div class="flex justify-between py-1 border-b border-slate-100 text-emerald-600">
            <span>Potongan Diskon:</span>
            <span class="font-mono font-semibold">- ${formatRupiah(inv.discount_amount)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between py-1 border-b border-slate-100 text-slate-600">
          <span>Pajak PPN (${inv.tax_rate}%):</span>
          <span class="font-mono font-semibold">${formatRupiah(inv.tax_amount)}</span>
        </div>
        <div class="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
          <span>TOTAL PEMBAYARAN:</span>
          <span class="font-mono text-blue-700 text-base">${formatRupiah(inv.grand_total)}</span>
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="grid grid-cols-2 gap-8 pt-8 mt-8 border-t border-slate-200 text-center text-xs">
      <div>
        <div class="text-slate-500">Penerima / Klien,</div>
        <div class="h-20 flex items-center justify-center text-slate-300 italic text-[11px]">(Tanda Tangan & Cap)</div>
        <div class="font-bold text-slate-900 border-t border-slate-300 mx-10 pt-1">${escapeHtml(inv.client.attn || inv.client.name)}</div>
      </div>
      <div>
        <div class="text-slate-500">Hormat Kami,</div>
        <div class="h-20 flex items-center justify-center">
          <div class="w-16 h-16 rounded-full border-2 border-dashed border-blue-300 flex items-center justify-center text-blue-600 text-[10px] font-bold uppercase rotate-12">
            STEMPEL RESMI
          </div>
        </div>
        <div class="font-bold text-slate-900 border-t border-slate-300 mx-10 pt-1">${escapeHtml(comp.name)}</div>
      </div>
    </div>
  `;

  openModal('modal-invoice-preview');
}
