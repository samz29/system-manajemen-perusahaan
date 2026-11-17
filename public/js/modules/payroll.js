let allPayrolls = [];
let currentPayrollPeriod = '2026-11';

async function loadPayrolls() {
  try {
    const periodParam = currentPayrollPeriod === 'Semua' ? '' : `?period=${currentPayrollPeriod}`;
    const res = await API.get(`/api/payrolls${periodParam}`);
    if (!res.success) return;
    allPayrolls = res.data;
    renderPayrollTable();
    updatePayrollPeriodDropdown();
  } catch (err) {
    showToast('Gagal memuat slip gaji: ' + err.message, 'error');
  }
}

function updatePayrollPeriodDropdown() {
  const select = document.getElementById('payroll-period-select');
  if (!select) return;
  // Keep values updated
  select.value = currentPayrollPeriod;
}

function filterPayrollByPeriod(period) {
  currentPayrollPeriod = period;
  loadPayrolls();
}

function renderPayrollTable() {
  const tbody = document.getElementById('payroll-table-body');
  const countBadge = document.getElementById('payroll-count-badge');
  if (countBadge) countBadge.textContent = allPayrolls.length;
  if (!tbody) return;

  if (!allPayrolls.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-money-check-dollar text-3xl mb-2 text-slate-300 block"></i>
          Belum ada slip gaji pada periode ini. Klik "Generate Penggajian Bulanan" untuk membuat otomatis.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allPayrolls.map(pay => {
    const isPaid = pay.status === 'Dibayar';
    const statusBadge = isPaid
      ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check text-[9px]"></i> Dibayar</span>'
      : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-regular fa-clock text-[9px]"></i> Siap Bayar</span>';

    const allowancesPlus = (Number(pay.total_allowance) || 0) + (Number(pay.bonus) || 0) + (Number(pay.overtime) || 0);

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
          ${pay.id}
          <div class="text-[11px] text-blue-600 font-sans font-medium">${pay.period_label}</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-bold text-slate-800">${escapeHtml(pay.employee_name)}</div>
          <div class="text-[11px] text-slate-500">${escapeHtml(pay.employee_position)} &bull; ${escapeHtml(pay.employee_department)}</div>
        </td>
        <td class="py-3.5 px-4 text-right font-mono font-medium text-slate-700">
          ${formatRupiah(pay.basic_salary)}
        </td>
        <td class="py-3.5 px-4 text-right font-mono text-emerald-600 font-medium">
          + ${formatRupiah(allowancesPlus)}
        </td>
        <td class="py-3.5 px-4 text-right font-mono text-rose-600 font-medium">
          - ${formatRupiah(pay.total_deduction)}
        </td>
        <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
          ${formatRupiah(pay.net_salary)}
        </td>
        <td class="py-3.5 px-4 text-center">
          ${statusBadge}
        </td>
        <td class="py-3.5 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="previewPayslip('${pay.id}')" title="Cetak Slip Gaji Resmi" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
              <i class="fa-solid fa-print"></i>
            </button>
            ${!isPaid ? `
              <button onclick="payPayrollPrompt('${pay.id}')" title="Tandai Selesai Dibayar" class="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <i class="fa-solid fa-money-bill-transfer"></i>
              </button>
            ` : ''}
            <button onclick="openEditSinglePayrollModal('${pay.id}')" title="Edit Rincian" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deletePayrollPrompt('${pay.id}')" title="Hapus" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Batch Payroll
function openBatchPayrollModal() {
  openModal('modal-batch-payroll');
}

async function executeBatchPayroll() {
  const period = document.getElementById('batch-payroll-period').value;
  if (!period) {
    showToast('Pilih periode bulan!', 'error');
    return;
  }

  try {
    const res = await API.post('/api/payrolls/generate-batch', { period });
    showToast(res.message || 'Penggajian batch berhasil diproses!', 'success');
    closeModal('modal-batch-payroll');
    currentPayrollPeriod = period;
    loadPayrolls();
    loadDashboard();
  } catch (err) {
    showToast('Gagal memproses penggajian: ' + err.message, 'error');
  }
}

// Single Payroll Form
let selectedEmployeeData = null;

function populatePayrollEmployeeOptions(selectedEmpId = null) {
  const select = document.getElementById('pay-form-employee');
  select.innerHTML = '';

  allEmployees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.name} (${emp.position})`;
    if (selectedEmpId && emp.id === selectedEmpId) opt.selected = true;
    select.appendChild(opt);
  });

  if (allEmployees.length > 0) {
    const defaultId = selectedEmpId || allEmployees[0].id;
    onPayrollEmployeeSelected(defaultId);
  }
}

function onPayrollEmployeeSelected(empId) {
  selectedEmployeeData = allEmployees.find(e => e.id === empId);
  if (!selectedEmployeeData) return;

  const basic = selectedEmployeeData.basic_salary || 0;
  const allow = (selectedEmployeeData.allowance_transport || 0) + 
                (selectedEmployeeData.allowance_meal || 0) + 
                (selectedEmployeeData.allowance_position || 0);

  document.getElementById('pay-preview-basic').textContent = formatRupiah(basic);
  document.getElementById('pay-preview-allowances').textContent = formatRupiah(allow);

  recalcSinglePayrollPreview();
}

function recalcSinglePayrollPreview() {
  if (!selectedEmployeeData) return;

  const basic = Number(selectedEmployeeData.basic_salary) || 0;
  const transport = Number(selectedEmployeeData.allowance_transport) || 0;
  const meal = Number(selectedEmployeeData.allowance_meal) || 0;
  const position = Number(selectedEmployeeData.allowance_position) || 0;
  const allowTotal = transport + meal + position;

  const bonus = parseFloat(document.getElementById('pay-form-bonus').value) || 0;
  const overtime = parseFloat(document.getElementById('pay-form-overtime').value) || 0;
  const gross = basic + allowTotal + bonus + overtime;

  const bpjsKs = Number(selectedEmployeeData.bpjs_kesehatan) || 0;
  const bpjsTk = Number(selectedEmployeeData.bpjs_ketenagakerjaan) || 0;
  const taxableIncome = Math.max(0, gross - 4500000);
  const pph21 = Math.round(taxableIncome * 0.05);

  const deductOther = parseFloat(document.getElementById('pay-form-deduction-other').value) || 0;
  const totalDeductions = bpjsKs + bpjsTk + pph21 + deductOther;
  const net = Math.max(0, gross - totalDeductions);

  document.getElementById('pay-preview-net').textContent = formatRupiah(net);
}

function openCreateSinglePayrollModal() {
  document.getElementById('single-payroll-modal-title').textContent = 'Buat Slip Gaji Karyawan';
  document.getElementById('pay-edit-id').value = '';
  document.getElementById('pay-form-bonus').value = 0;
  document.getElementById('pay-form-overtime').value = 0;
  document.getElementById('pay-form-deduction-other').value = 0;
  document.getElementById('pay-form-status').value = 'Siap Bayar';
  
  populatePayrollEmployeeOptions();
  openModal('modal-single-payroll');
}

function openEditSinglePayrollModal(id) {
  const pay = allPayrolls.find(p => p.id === id);
  if (!pay) return;

  document.getElementById('single-payroll-modal-title').textContent = `Edit Slip Gaji: ${pay.employee_name}`;
  document.getElementById('pay-edit-id').value = pay.id;
  document.getElementById('pay-form-period').value = pay.period;
  document.getElementById('pay-form-bonus').value = pay.bonus || 0;
  document.getElementById('pay-form-overtime').value = pay.overtime || 0;
  document.getElementById('pay-form-deduction-other').value = pay.deduction_other || 0;
  document.getElementById('pay-form-status').value = pay.status;

  populatePayrollEmployeeOptions(pay.employee_id);
  openModal('modal-single-payroll');
}

async function handleSaveSinglePayroll(e) {
  e.preventDefault();
  const id = document.getElementById('pay-edit-id').value;

  const empId = document.getElementById('pay-form-employee').value;
  const period = document.getElementById('pay-form-period').value;
  const bonus = parseFloat(document.getElementById('pay-form-bonus').value) || 0;
  const overtime = parseFloat(document.getElementById('pay-form-overtime').value) || 0;
  const deductionOther = parseFloat(document.getElementById('pay-form-deduction-other').value) || 0;
  const status = document.getElementById('pay-form-status').value;

  try {
    if (id) {
      await API.put(`/api/payrolls/${id}`, {
        bonus,
        overtime,
        deduction_other: deductionOther,
        status
      });
      showToast('Slip gaji berhasil diperbarui!', 'success');
    } else {
      await API.post('/api/payrolls', {
        employee_id: empId,
        period,
        bonus,
        overtime,
        deduction_other: deductionOther,
        status
      });
      showToast('Slip gaji berhasil dibuat!', 'success');
    }

    closeModal('modal-single-payroll');
    loadPayrolls();
    loadDashboard();
    loadTransactions();
  } catch (err) {
    showToast('Gagal menyimpan slip gaji: ' + err.message, 'error');
  }
}

async function payPayrollPrompt(id) {
  if (!confirm('Tandai gaji ini telah DIBAYAR? Pengeluaran akan otomatis dicatat sebagai beban gaji di modul Akuntansi.')) return;
  try {
    await API.post(`/api/payrolls/${id}/pay`, {});
    showToast('Gaji telah dibayar & tercatat di buku kas!', 'success');
    loadPayrolls();
    loadDashboard();
    loadTransactions();
  } catch (err) {
    showToast('Gagal memproses pembayaran gaji: ' + err.message, 'error');
  }
}

async function deletePayrollPrompt(id) {
  if (!confirm('Hapus slip gaji ini?')) return;
  try {
    await API.delete(`/api/payrolls/${id}`);
    showToast('Slip gaji berhasil dihapus', 'success');
    loadPayrolls();
    loadDashboard();
  } catch (err) {
    showToast('Gagal menghapus slip gaji: ' + err.message, 'error');
  }
}

// Professional A4 Printable Payslip View
async function previewPayslip(id) {
  const pay = allPayrolls.find(p => p.id === id);
  if (!pay) return;

  const compRes = await API.get('/api/company');
  const comp = compRes.data || {};

  const card = document.getElementById('payslip-print-card');

  card.innerHTML = `
    <!-- Header / Kop Surat -->
    <div class="flex justify-between items-start border-b-2 border-slate-900 pb-4">
      <div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
            <i class="fa-solid fa-building-columns text-sm"></i>
          </div>
          <h1 class="text-lg font-black text-slate-900 tracking-tight uppercase">${escapeHtml(comp.name)}</h1>
        </div>
        <p class="text-slate-600 text-[11px] mt-1">${escapeHtml(comp.address || '')}</p>
        <p class="text-slate-500 text-[11px]">Telp: ${escapeHtml(comp.phone || '')} &bull; Email: ${escapeHtml(comp.email || '')}</p>
      </div>

      <div class="text-right">
        <h2 class="text-xl font-black text-emerald-700 tracking-wider uppercase">SLIP GAJI KARYAWAN</h2>
        <div class="font-mono text-slate-600 text-xs mt-1">Periode: <span class="font-bold text-slate-900">${pay.period_label}</span></div>
        <div class="text-[10px] text-slate-400 font-mono mt-0.5">No: ${pay.id}</div>
      </div>
    </div>

    <!-- Employee Info Box -->
    <div class="grid grid-cols-2 gap-4 my-5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
      <div>
        <div class="text-slate-500">Nama Karyawan:</div>
        <div class="font-bold text-slate-900 text-sm">${escapeHtml(pay.employee_name)}</div>
        <div class="text-slate-600 text-[11px] mt-1">NIK: <span class="font-mono font-semibold">${pay.employee_id}</span></div>
      </div>

      <div class="text-right">
        <div class="text-slate-500">Jabatan & Departemen:</div>
        <div class="font-bold text-slate-900">${escapeHtml(pay.employee_position)}</div>
        <div class="text-slate-600 text-[11px] mt-1">${escapeHtml(pay.employee_department)}</div>
        <div class="text-slate-500 text-[10px] mt-0.5">Rekening: ${escapeHtml(pay.payment_method || '-')}</div>
      </div>
    </div>

    <!-- Two-column Earnings vs Deductions Breakdown -->
    <div class="grid grid-cols-2 gap-6 my-4 text-xs">
      <!-- Left: Penerimaan -->
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <div class="bg-emerald-50 px-3.5 py-2 border-b border-emerald-100 font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
          <span>A. PENERIMAAN</span>
          <i class="fa-solid fa-plus text-emerald-600"></i>
        </div>
        <div class="p-3.5 space-y-2">
          <div class="flex justify-between">
            <span class="text-slate-600">Gaji Pokok:</span>
            <span class="font-mono font-semibold">${formatRupiah(pay.basic_salary)}</span>
          </div>
          ${pay.allowance_position > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-600">Tunjangan Jabatan:</span>
              <span class="font-mono font-semibold">${formatRupiah(pay.allowance_position)}</span>
            </div>
          ` : ''}
          ${pay.allowance_transport > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-600">Tunjangan Transport:</span>
              <span class="font-mono font-semibold">${formatRupiah(pay.allowance_transport)}</span>
            </div>
          ` : ''}
          ${pay.allowance_meal > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-600">Tunjangan Makan:</span>
              <span class="font-mono font-semibold">${formatRupiah(pay.allowance_meal)}</span>
            </div>
          ` : ''}
          ${pay.bonus > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-600">Bonus / Insentif:</span>
              <span class="font-mono font-semibold">${formatRupiah(pay.bonus)}</span>
            </div>
          ` : ''}
          ${pay.overtime > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-600">Uang Lembur:</span>
              <span class="font-mono font-semibold">${formatRupiah(pay.overtime)}</span>
            </div>
          ` : ''}
          <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-emerald-800">
            <span>Total Penerimaan Kotor:</span>
            <span class="font-mono">${formatRupiah(pay.gross_salary)}</span>
          </div>
        </div>
      </div>

      <!-- Right: Potongan -->
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <div class="bg-rose-50 px-3.5 py-2 border-b border-rose-100 font-bold text-rose-900 uppercase tracking-wider flex items-center justify-between">
          <span>B. POTONGAN</span>
          <i class="fa-solid fa-minus text-rose-600"></i>
        </div>
        <div class="p-3.5 space-y-2">
          <div class="flex justify-between">
            <span class="text-slate-600">BPJS Kesehatan:</span>
            <span class="font-mono font-semibold">${formatRupiah(pay.deduction_bpjs_ks)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-600">BPJS Ketenagakerjaan:</span>
            <span class="font-mono font-semibold">${formatRupiah(pay.deduction_bpjs_tk)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-600">Estimasi PPh 21:</span>
            <span class="font-mono font-semibold">${formatRupiah(pay.deduction_pph21)}</span>
          </div>
          ${pay.deduction_other > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-600">Kasbon / Potongan Lain:</span>
              <span class="font-mono font-semibold">${formatRupiah(pay.deduction_other)}</span>
            </div>
          ` : ''}
          <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-rose-800">
            <span>Total Potongan:</span>
            <span class="font-mono">${formatRupiah(pay.total_deduction)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Take Home Pay Card -->
    <div class="my-5 p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between">
      <div>
        <div class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">GAJI BERSIH DITERIMA (TAKE HOME PAY)</div>
        <div class="text-2xl font-black font-mono text-emerald-400 mt-0.5">${formatRupiah(pay.net_salary)}</div>
      </div>
      <div class="text-right">
        <span class="inline-block px-3 py-1 rounded-full text-xs font-bold ${pay.status === 'Dibayar' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">
          ${pay.status === 'Dibayar' ? 'LUNAS DIBAYAR' : 'SIAP DITRANSFER'}
        </span>
        ${pay.payment_date ? `<div class="text-[10px] text-slate-400 mt-1">Dibayar: ${formatDate(pay.payment_date)}</div>` : ''}
      </div>
    </div>

    <!-- Signatures Section -->
    <div class="grid grid-cols-2 gap-8 pt-6 mt-6 border-t border-slate-200 text-center text-xs">
      <div>
        <div class="text-slate-500">Penerima Gaji,</div>
        <div class="h-16 flex items-center justify-center text-slate-300 italic text-[11px]">(Tanda Tangan)</div>
        <div class="font-bold text-slate-900 border-t border-slate-300 mx-10 pt-1">${escapeHtml(pay.employee_name)}</div>
      </div>
      <div>
        <div class="text-slate-500">Finance & Payroll Manager,</div>
        <div class="h-16 flex items-center justify-center">
          <div class="w-14 h-14 rounded-full border-2 border-dashed border-emerald-400 flex items-center justify-center text-emerald-600 text-[9px] font-bold uppercase rotate-6">
            VERIFIKASI
          </div>
        </div>
        <div class="font-bold text-slate-900 border-t border-slate-300 mx-10 pt-1">${escapeHtml(comp.name)}</div>
      </div>
    </div>
  `;

  openModal('modal-payslip-preview');
}
