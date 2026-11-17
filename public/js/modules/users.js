let allUsers = [];

async function loadUsers() {
  try {
    const res = await API.get('/api/users');
    if (!res.success) return;
    allUsers = res.data;
    renderUsersTable();
  } catch (err) {
    showToast('Gagal memuat pengguna: ' + err.message, 'error');
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (!allUsers.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-user-shield text-3xl mb-2 text-slate-300 block"></i>
          Belum ada pengguna tambahan terdaftar.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allUsers.map(u => {
    const roleDef = ROLE_DEFINITIONS[u.role] || { label: u.role, badgeClass: 'bg-slate-100 text-slate-700' };
    const initials = u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const isCurrent = currentUser && currentUser.id === u.id;

    return `
      <tr class="hover:bg-slate-50/80 transition-colors text-xs">
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center text-xs shrink-0">
              ${initials}
            </div>
            <div>
              <div class="font-bold text-slate-900 flex items-center gap-1.5">
                ${escapeHtml(u.name)}
                ${isCurrent ? '<span class="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded">Anda</span>' : ''}
              </div>
              <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-4">
          <span class="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${roleDef.badgeClass}">
            ${roleDef.label}
          </span>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-medium text-slate-800">${escapeHtml(u.position || '-')}</div>
          ${u.employee_id ? `<div class="text-[10px] text-blue-600 font-mono">Linked: ${u.employee_id}</div>` : ''}
        </td>
        <td class="py-3.5 px-4 text-center">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">
            <span class="w-1.5 h-1.5 rounded-full ${u.status === 'Aktif' ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
            ${u.status}
          </span>
        </td>
        <td class="py-3.5 px-4 text-slate-500 text-[11px]">
          ${u.last_login ? formatDate(u.last_login) : 'Belum pernah login'}
        </td>
        <td class="py-3.5 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditUserModal('${u.id}')" title="Edit Pengguna" class="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <i class="fa-solid fa-user-pen"></i>
            </button>
            ${!isCurrent ? `
              <button onclick="deleteUserPrompt('${u.id}')" title="Hapus Pengguna" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function populateUserEmployeeDropdown(selectedEmpId = null) {
  const select = document.getElementById('user-form-employee');
  if (!select) return;
  select.innerHTML = '<option value="">-- Tidak Dikaitkan ke Data Karyawan --</option>';

  (allEmployees || []).forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.name} (${emp.position} - ${emp.department})`;
    if (selectedEmpId && emp.id === selectedEmpId) opt.selected = true;
    select.appendChild(opt);
  });
}

function openCreateUserModal() {
  document.getElementById('user-modal-title').textContent = 'Tambah Pengguna Baru';
  document.getElementById('user-edit-id').value = '';
  document.getElementById('user-form-name').value = '';
  document.getElementById('user-form-email').value = '';
  document.getElementById('user-form-password').value = '';
  document.getElementById('user-form-password-hint').textContent = 'Kata sandi minimal 6 karakter.';
  document.getElementById('user-form-password').required = true;
  document.getElementById('user-form-role').value = 'STAFF';
  document.getElementById('user-form-status').value = 'Aktif';

  populateUserEmployeeDropdown();
  openModal('modal-user-form');
}

function openEditUserModal(id) {
  const user = allUsers.find(u => u.id === id);
  if (!user) return;

  document.getElementById('user-modal-title').textContent = `Edit Pengguna: ${user.name}`;
  document.getElementById('user-edit-id').value = user.id;
  document.getElementById('user-form-name').value = user.name;
  document.getElementById('user-form-email').value = user.email;
  document.getElementById('user-form-password').value = '';
  document.getElementById('user-form-password-hint').textContent = 'Kosongkan jika tidak ingin mengubah kata sandi.';
  document.getElementById('user-form-password').required = false;
  document.getElementById('user-form-role').value = user.role;
  document.getElementById('user-form-status').value = user.status;

  populateUserEmployeeDropdown(user.employee_id);
  openModal('modal-user-form');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const editId = document.getElementById('user-edit-id').value;

  const payload = {
    name: document.getElementById('user-form-name').value.trim(),
    email: document.getElementById('user-form-email').value.trim(),
    role: document.getElementById('user-form-role').value,
    employee_id: document.getElementById('user-form-employee').value || null,
    status: document.getElementById('user-form-status').value
  };

  const pwd = document.getElementById('user-form-password').value;
  if (pwd) payload.password = pwd;

  try {
    if (editId) {
      await API.put(`/api/users/${editId}`, payload);
      showToast('Data pengguna berhasil diperbarui!', 'success');
    } else {
      await API.post('/api/users', payload);
      showToast('Pengguna baru berhasil ditambahkan!', 'success');
    }

    closeModal('modal-user-form');
    loadUsers();
  } catch (err) {
    showToast('Gagal menyimpan pengguna: ' + err.message, 'error');
  }
}

async function deleteUserPrompt(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus akun pengguna ini?')) return;
  try {
    await API.delete(`/api/users/${id}`);
    showToast('Pengguna telah dihapus', 'success');
    loadUsers();
  } catch (err) {
    showToast('Gagal menghapus pengguna: ' + err.message, 'error');
  }
}
