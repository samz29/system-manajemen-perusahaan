let allEmployees = [];
let employeeSearchQuery = '';

async function loadEmployees() {
  try {
    const res = await API.get('/api/employees');
    if (!res.success) return;
    allEmployees = res.data;
    renderEmployeesTable();
  } catch (err) {
    showToast('Gagal memuat data karyawan: ' + err.message, 'error');
  }
}

function searchEmployees(query) {
  employeeSearchQuery = (query || '').toLowerCase().trim();
  renderEmployeesTable();
}

function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;

  let list = allEmployees;
  if (employeeSearchQuery) {
    list = list.filter(e => 
      (e.name && e.name.toLowerCase().includes(employeeSearchQuery)) ||
      (e.position && e.position.toLowerCase().includes(employeeSearchQuery)) ||
      (e.department && e.department.toLowerCase().includes(employeeSearchQuery)) ||
      (e.id && e.id.toLowerCase().includes(employeeSearchQuery))
    );
  }

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-users text-3xl mb-2 text-slate-300 block"></i>
          Tidak ada data karyawan ditemukan
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(emp => {
    const initials = emp.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const totalAllowances = (Number(emp.allowance_transport) || 0) + (Number(emp.allowance_meal) || 0) + (Number(emp.allowance_position) || 0);

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
              ${initials}
            </div>
            <div>
              <div class="font-bold text-slate-900">${escapeHtml(emp.name)}</div>
              <div class="text-[11px] text-slate-400 font-mono">${emp.id} &bull; Masuk: ${formatDate(emp.join_date)}</div>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-semibold text-slate-800">${escapeHtml(emp.position)}</div>
          <span class="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600 mt-0.5 border border-slate-200">
            ${escapeHtml(emp.department)}
          </span>
        </td>
        <td class="py-3.5 px-4">
          <div class="text-slate-700 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${emp.status === 'Aktif' ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
            <span class="font-semibold">${emp.status}</span> (${emp.employment_type})
          </div>
          <div class="text-[11px] text-slate-400">${escapeHtml(emp.phone || emp.email || '-')}</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-semibold text-slate-800">${escapeHtml(emp.bank_name || 'BCA')}</div>
          <div class="text-[11px] font-mono text-slate-500">${escapeHtml(emp.bank_account || '-')}</div>
        </td>
        <td class="py-3.5 px-4 text-right">
          <div class="font-mono font-bold text-slate-900">${formatRupiah(emp.basic_salary)}</div>
          <div class="text-[10px] text-slate-400 font-mono">+ Tunjangan: ${formatRupiah(totalAllowances)}</div>
        </td>
        <td class="py-3.5 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditEmployeeModal('${emp.id}')" title="Edit Karyawan" class="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <i class="fa-solid fa-user-pen"></i>
            </button>
            <button onclick="deleteEmployeePrompt('${emp.id}')" title="Hapus Karyawan" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCreateEmployeeModal() {
  document.getElementById('emp-modal-title').textContent = 'Tambah Karyawan Baru';
  document.getElementById('emp-edit-id').value = '';
  document.getElementById('emp-form-id').value = '';
  document.getElementById('emp-form-name').value = '';
  document.getElementById('emp-form-email').value = '';
  document.getElementById('emp-form-phone').value = '';
  document.getElementById('emp-form-position').value = '';
  document.getElementById('emp-form-department').value = 'Teknologi & IT';
  document.getElementById('emp-form-type').value = 'Tetap';
  document.getElementById('emp-form-join-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('emp-form-bank-name').value = 'BCA';
  document.getElementById('emp-form-bank-account').value = '';
  document.getElementById('emp-form-basic-salary').value = 8000000;
  document.getElementById('emp-form-allow-position').value = 1000000;
  document.getElementById('emp-form-allow-transport').value = 800000;
  document.getElementById('emp-form-allow-meal').value = 800000;
  document.getElementById('emp-form-bpjs-ks').value = 150000;
  document.getElementById('emp-form-bpjs-tk').value = 250000;

  openModal('modal-employee-form');
}

function openEditEmployeeModal(id) {
  const emp = allEmployees.find(e => e.id === id);
  if (!emp) return;

  document.getElementById('emp-modal-title').textContent = `Edit Karyawan: ${emp.name}`;
  document.getElementById('emp-edit-id').value = emp.id;
  document.getElementById('emp-form-id').value = emp.id;
  document.getElementById('emp-form-name').value = emp.name;
  document.getElementById('emp-form-email').value = emp.email || '';
  document.getElementById('emp-form-phone').value = emp.phone || '';
  document.getElementById('emp-form-position').value = emp.position || '';
  document.getElementById('emp-form-department').value = emp.department || 'Teknologi & IT';
  document.getElementById('emp-form-type').value = emp.employment_type || 'Tetap';
  document.getElementById('emp-form-join-date').value = emp.join_date || '';
  document.getElementById('emp-form-bank-name').value = emp.bank_name || 'BCA';
  document.getElementById('emp-form-bank-account').value = emp.bank_account || '';
  document.getElementById('emp-form-basic-salary').value = emp.basic_salary || 0;
  document.getElementById('emp-form-allow-position').value = emp.allowance_position || 0;
  document.getElementById('emp-form-allow-transport').value = emp.allowance_transport || 0;
  document.getElementById('emp-form-allow-meal').value = emp.allowance_meal || 0;
  document.getElementById('emp-form-bpjs-ks').value = emp.bpjs_kesehatan || 0;
  document.getElementById('emp-form-bpjs-tk').value = emp.bpjs_ketenagakerjaan || 0;

  openModal('modal-employee-form');
}

async function handleSaveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('emp-edit-id').value;

  const payload = {
    id: document.getElementById('emp-form-id').value.trim() || undefined,
    name: document.getElementById('emp-form-name').value.trim(),
    email: document.getElementById('emp-form-email').value.trim(),
    phone: document.getElementById('emp-form-phone').value.trim(),
    position: document.getElementById('emp-form-position').value.trim(),
    department: document.getElementById('emp-form-department').value,
    employment_type: document.getElementById('emp-form-type').value,
    join_date: document.getElementById('emp-form-join-date').value,
    bank_name: document.getElementById('emp-form-bank-name').value.trim(),
    bank_account: document.getElementById('emp-form-bank-account').value.trim(),
    basic_salary: parseFloat(document.getElementById('emp-form-basic-salary').value) || 0,
    allowance_position: parseFloat(document.getElementById('emp-form-allow-position').value) || 0,
    allowance_transport: parseFloat(document.getElementById('emp-form-allow-transport').value) || 0,
    allowance_meal: parseFloat(document.getElementById('emp-form-allow-meal').value) || 0,
    bpjs_kesehatan: parseFloat(document.getElementById('emp-form-bpjs-ks').value) || 0,
    bpjs_ketenagakerjaan: parseFloat(document.getElementById('emp-form-bpjs-tk').value) || 0,
    status: 'Aktif'
  };

  try {
    if (id) {
      await API.put(`/api/employees/${id}`, payload);
      showToast('Data karyawan berhasil diperbarui!', 'success');
    } else {
      await API.post('/api/employees', payload);
      showToast('Karyawan baru berhasil ditambahkan!', 'success');
    }
    closeModal('modal-employee-form');
    loadEmployees();
    loadDashboard();
  } catch (err) {
    showToast('Gagal menyimpan karyawan: ' + err.message, 'error');
  }
}

async function deleteEmployeePrompt(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus data karyawan ini?')) return;
  try {
    await API.delete(`/api/employees/${id}`);
    showToast('Data karyawan berhasil dihapus', 'success');
    loadEmployees();
    loadDashboard();
  } catch (err) {
    showToast('Gagal menghapus karyawan: ' + err.message, 'error');
  }
}
