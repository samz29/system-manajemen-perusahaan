let allAssets = [];
let currentAssetCategory = 'Semua';
let currentAssetCondition = 'Semua';
let assetSearchQuery = '';

async function loadAssets() {
  try {
    let url = '/api/assets?';
    if (currentAssetCategory !== 'Semua') url += `category=${encodeURIComponent(currentAssetCategory)}&`;
    if (currentAssetCondition !== 'Semua') url += `condition=${encodeURIComponent(currentAssetCondition)}&`;
    if (assetSearchQuery) url += `search=${encodeURIComponent(assetSearchQuery)}`;

    const res = await API.get(url);
    if (!res.success) return;
    allAssets = res.data;
    renderAssetsTable();
    updateAssetSummaryMetrics();
  } catch (err) {
    showToast('Gagal memuat data aset: ' + err.message, 'error');
  }
}

function updateAssetSummaryMetrics() {
  const totalCount = allAssets.length;
  const totalAcquisition = allAssets.reduce((acc, a) => acc + (Number(a.purchase_price) || 0), 0);
  const totalBookValue = allAssets.reduce((acc, a) => acc + (Number(a.current_book_value) || 0), 0);
  const totalDepreciation = allAssets.reduce((acc, a) => acc + (Number(a.accumulated_depreciation) || 0), 0);
  const inMaintenance = allAssets.filter(a => a.condition === 'Dalam Perbaikan' || a.condition === 'Rusak / Usang').length;

  const countEl = document.getElementById('asset-stat-total');
  const acqEl = document.getElementById('asset-stat-acquisition');
  const bookEl = document.getElementById('asset-stat-book-value');
  const depEl = document.getElementById('asset-stat-depreciation');
  const maintEl = document.getElementById('asset-stat-maintenance');

  if (countEl) countEl.textContent = `${totalCount} Unit`;
  if (acqEl) acqEl.textContent = formatRupiah(totalAcquisition);
  if (bookEl) bookEl.textContent = formatRupiah(totalBookValue);
  if (depEl) depEl.textContent = formatRupiah(totalDepreciation);
  if (maintEl) maintEl.textContent = `${inMaintenance} Unit`;
}

function filterAssetCategory(cat) {
  currentAssetCategory = cat;
  document.querySelectorAll('.asset-cat-btn').forEach(btn => {
    btn.className = 'asset-cat-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-transparent';
  });
  const activeBtn = document.getElementById(`asset-cat-${cat.replace(/\s+/g, '-').replace('&', 'and')}`);
  if (activeBtn) {
    activeBtn.className = 'asset-cat-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200';
  }
  loadAssets();
}

function filterAssetCondition(cond) {
  currentAssetCondition = cond;
  loadAssets();
}

function searchAssets(query) {
  assetSearchQuery = (query || '').trim();
  loadAssets();
}

function renderAssetsTable() {
  const tbody = document.getElementById('assets-table-body');
  if (!tbody) return;

  if (!allAssets.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-boxes-stacked text-3xl mb-2 text-slate-300 block"></i>
          Tidak ada aset inventaris yang ditemukan. Klik "Tambah Aset Baru" untuk mendaftarkan aset.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allAssets.map(asset => {
    // Condition Badge
    let condBadge = '';
    if (asset.condition === 'Sangat Baik') {
      condBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check text-[8px]"></i> Sangat Baik</span>';
    } else if (asset.condition === 'Baik') {
      condBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-circle text-[8px]"></i> Baik</span>';
    } else if (asset.condition === 'Dalam Perbaikan') {
      condBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"><i class="fa-solid fa-wrench text-[8px]"></i> Perbaikan</span>';
    } else {
      condBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-triangle-exclamation text-[8px]"></i> Rusak / Usang</span>';
    }

    // Category icon
    let catIcon = 'fa-box';
    if (asset.category.includes('Elektronik')) catIcon = 'fa-laptop';
    else if (asset.category.includes('Kendaraan')) catIcon = 'fa-car-side';
    else if (asset.category.includes('Furnitur')) catIcon = 'fa-chair';
    else if (asset.category.includes('Mesin')) catIcon = 'fa-server';

    const depPct = asset.depreciation_percent || 0;

    return `
      <tr class="hover:bg-slate-50/80 transition-colors text-xs">
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <i class="fa-solid ${catIcon}"></i>
            </div>
            <div>
              <div class="font-bold text-slate-900 line-clamp-1">${escapeHtml(asset.name)}</div>
              <div class="text-[11px] font-mono text-slate-500 font-semibold">${asset.id} &bull; S/N: ${escapeHtml(asset.serial_number || '-')}</div>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-4">
          <div class="text-slate-800 font-medium">${escapeHtml(asset.category)}</div>
          <div class="text-[11px] text-slate-400">Beli: ${formatDate(asset.purchase_date)}</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-semibold text-slate-800 flex items-center gap-1">
            <i class="fa-solid fa-user-check text-slate-400 text-[10px]"></i>
            ${escapeHtml(asset.assigned_to_name || '-')}
          </div>
          <div class="text-[11px] text-slate-500">${escapeHtml(asset.location || '-')}</div>
        </td>
        <td class="py-3.5 px-4 text-center">
          ${condBadge}
        </td>
        <td class="py-3.5 px-4 text-right">
          <div class="font-mono font-semibold text-slate-700">${formatRupiah(asset.purchase_price)}</div>
          <div class="text-[10px] text-slate-400">Masa: ${asset.useful_life_years} Thn</div>
        </td>
        <td class="py-3.5 px-4 text-right">
          <div class="font-mono font-bold text-blue-700">${formatRupiah(asset.current_book_value)}</div>
          <div class="flex items-center justify-end gap-1.5 mt-1">
            <div class="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${depPct}%"></div>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">${depPct}% susut</span>
          </div>
        </td>
        <td class="py-3.5 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="previewAssetLabel('${asset.id}')" title="Cetak Label Inventaris / Barcode" class="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <i class="fa-solid fa-qrcode"></i>
            </button>
            <button onclick="openEditAssetModal('${asset.id}')" title="Edit Aset" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deleteAssetPrompt('${asset.id}')" title="Hapus Aset" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function populateAssetEmployeeDropdown(selectedEmpId = null) {
  const select = document.getElementById('asset-form-assigned');
  if (!select) return;
  if (!allEmployees || !allEmployees.length) {
    try {
      const res = await API.get('/api/employees');
      if (res.success) allEmployees = res.data;
    } catch {}
  }
  select.innerHTML = '<option value="">-- Tidak Ditugaskan / Inventaris Umum --</option>';

  (allEmployees || []).forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.name} (${emp.position})`;
    if (selectedEmpId && emp.id === selectedEmpId) opt.selected = true;
    select.appendChild(opt);
  });
}

function openCreateAssetModal() {
  document.getElementById('asset-modal-title').textContent = 'Tambah Aset Perusahaan Baru';
  document.getElementById('asset-edit-id').value = '';
  document.getElementById('asset-form-id').value = '';
  document.getElementById('asset-form-name').value = '';
  document.getElementById('asset-form-category').value = 'Elektronik & Komputer';
  document.getElementById('asset-form-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('asset-form-price').value = '';
  document.getElementById('asset-form-useful-years').value = 4;
  document.getElementById('asset-form-salvage').value = 0;
  document.getElementById('asset-form-location').value = 'Kantor Pusat Jakarta';
  document.getElementById('asset-form-condition').value = 'Sangat Baik';
  document.getElementById('asset-form-sn').value = '';
  document.getElementById('asset-form-vendor').value = '';
  document.getElementById('asset-form-notes').value = '';
  
  const chkRecord = document.getElementById('asset-form-record-expense');
  if (chkRecord) chkRecord.checked = false;

  populateAssetEmployeeDropdown();
  openModal('modal-asset-form');
}

function openEditAssetModal(id) {
  const asset = allAssets.find(a => a.id === id);
  if (!asset) return;

  document.getElementById('asset-modal-title').textContent = `Edit Aset: ${asset.name}`;
  document.getElementById('asset-edit-id').value = asset.id;
  document.getElementById('asset-form-id').value = asset.id;
  document.getElementById('asset-form-name').value = asset.name;
  document.getElementById('asset-form-category').value = asset.category;
  document.getElementById('asset-form-date').value = asset.purchase_date;
  document.getElementById('asset-form-price').value = asset.purchase_price;
  document.getElementById('asset-form-useful-years').value = asset.useful_life_years;
  document.getElementById('asset-form-salvage').value = asset.salvage_value || 0;
  document.getElementById('asset-form-location').value = asset.location || '';
  document.getElementById('asset-form-condition').value = asset.condition || 'Baik';
  document.getElementById('asset-form-sn').value = asset.serial_number || '';
  document.getElementById('asset-form-vendor').value = asset.vendor || '';
  document.getElementById('asset-form-notes').value = asset.notes || '';

  const chkRecord = document.getElementById('asset-form-record-expense');
  if (chkRecord) {
    chkRecord.checked = false;
    chkRecord.parentElement.style.display = 'none'; // Only for creation
  }

  populateAssetEmployeeDropdown(asset.assigned_to_id);
  openModal('modal-asset-form');
}

async function handleSaveAsset(e) {
  e.preventDefault();
  const editId = document.getElementById('asset-edit-id').value;

  const payload = {
    id: document.getElementById('asset-form-id').value.trim() || undefined,
    name: document.getElementById('asset-form-name').value.trim(),
    category: document.getElementById('asset-form-category').value,
    purchase_date: document.getElementById('asset-form-date').value,
    purchase_price: parseFloat(document.getElementById('asset-form-price').value) || 0,
    useful_life_years: parseInt(document.getElementById('asset-form-useful-years').value, 10) || 4,
    salvage_value: parseFloat(document.getElementById('asset-form-salvage').value) || 0,
    location: document.getElementById('asset-form-location').value.trim(),
    condition: document.getElementById('asset-form-condition').value,
    serial_number: document.getElementById('asset-form-sn').value.trim(),
    vendor: document.getElementById('asset-form-vendor').value.trim(),
    notes: document.getElementById('asset-form-notes').value.trim(),
    assigned_to_id: document.getElementById('asset-form-assigned').value || null,
    record_expense: document.getElementById('asset-form-record-expense')?.checked || false
  };

  try {
    if (editId) {
      await API.put(`/api/assets/${editId}`, payload);
      showToast('Data aset berhasil diperbarui!', 'success');
    } else {
      await API.post('/api/assets', payload);
      showToast('Aset baru berhasil dicatatkan!', 'success');
    }

    closeModal('modal-asset-form');
    loadAssets();
    loadDashboard();
    loadTransactions();
  } catch (err) {
    showToast('Gagal menyimpan aset: ' + err.message, 'error');
  }
}

async function deleteAssetPrompt(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus aset ini dari inventaris perusahaan?')) return;
  try {
    await API.delete(`/api/assets/${id}`);
    showToast('Aset telah dihapus dari inventaris', 'success');
    loadAssets();
    loadDashboard();
  } catch (err) {
    showToast('Gagal menghapus aset: ' + err.message, 'error');
  }
}

// A4 Asset Label & Barcode Tag Print
async function previewAssetLabel(id) {
  const asset = allAssets.find(a => a.id === id);
  if (!asset) return;

  const compRes = await API.get('/api/company');
  const comp = compRes.data || {};

  const card = document.getElementById('asset-label-print-card');

  card.innerHTML = `
    <div class="border-4 border-slate-900 rounded-2xl p-6 bg-white max-w-md mx-auto shadow-sm">
      <!-- Kop Perusahaan -->
      <div class="flex items-center justify-between border-b-2 border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
            <i class="fa-solid fa-building-columns"></i>
          </div>
          <div>
            <div class="font-extrabold text-slate-900 text-xs tracking-tight uppercase">${escapeHtml(comp.name)}</div>
            <div class="text-[9px] text-slate-500 font-semibold tracking-wider uppercase">PROPERTY OF COMPANY</div>
          </div>
        </div>
        <span class="text-[10px] bg-slate-100 text-slate-700 font-mono font-bold px-2 py-0.5 rounded border border-slate-300">
          INVENTARIS RESMI
        </span>
      </div>

      <!-- Barcode Visual Simulation -->
      <div class="my-4 text-center">
        <div class="h-14 bg-slate-900 flex items-center justify-center text-white font-mono text-base tracking-[0.35em] font-bold rounded">
          *${asset.id}*
        </div>
        <div class="text-xs font-mono font-bold text-slate-800 mt-1 tracking-wider">${asset.id}</div>
      </div>

      <!-- Details List -->
      <div class="space-y-1.5 text-[11px] border-t border-slate-200 pt-3">
        <div class="flex justify-between">
          <span class="text-slate-500">Nama Aset:</span>
          <span class="font-bold text-slate-900 text-right max-w-[220px]">${escapeHtml(asset.name)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Kategori:</span>
          <span class="font-semibold text-slate-800">${escapeHtml(asset.category)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Nomor Seri (S/N):</span>
          <span class="font-mono font-semibold text-slate-800">${escapeHtml(asset.serial_number || '-')}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Pemegang / PIC:</span>
          <span class="font-bold text-blue-700">${escapeHtml(asset.assigned_to_name || 'Inventaris Umum')}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Lokasi:</span>
          <span class="text-slate-700">${escapeHtml(asset.location || '-')}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Tgl Perolehan:</span>
          <span class="text-slate-700">${formatDate(asset.purchase_date)}</span>
        </div>
      </div>

      <!-- Warning note -->
      <div class="mt-4 pt-2 border-t border-dashed border-slate-300 text-center text-[9px] text-slate-400">
        Dilarang merusak, memindahkan atau melepas label barcode ini tanpa izin Bagian Operasional & Aset.
      </div>
    </div>
  `;

  openModal('modal-asset-label-preview');
}
