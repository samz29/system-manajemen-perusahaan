let currentUser = null;

const ROLE_DEFINITIONS = {
  SUPER_ADMIN: {
    label: "Super Admin",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    color: "#9333ea",
    permissions: ['dashboard', 'invoices', 'accounting', 'employees', 'payroll', 'assets', 'users', 'settings']
  },
  FINANCE: {
    label: "Manajer Keuangan",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    color: "#059669",
    permissions: ['dashboard', 'invoices', 'accounting', 'payroll', 'assets']
  },
  HR: {
    label: "HR & People Ops",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    color: "#2563eb",
    permissions: ['dashboard', 'employees', 'payroll', 'assets']
  },
  STAFF: {
    label: "Staff Karyawan",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    color: "#d97706",
    permissions: ['dashboard', 'payroll', 'assets']
  }
};

async function initAuth() {
  const token = localStorage.getItem('auth_token');

  if (token) {
    try {
      const res = await API.get('/api/auth/me');
      if (res.success && res.user) {
        currentUser = res.user;
        renderAuthUI();
        return;
      }
    } catch (err) {
      console.warn("Token expired, clearing auth session:", err);
      localStorage.removeItem('auth_token');
    }
  }

  // No valid session - show login modal
  showLoginModal();
}

function hasPermission(moduleKey) {
  if (!currentUser) return false;
  const def = ROLE_DEFINITIONS[currentUser.role];
  if (!def) return false;
  return def.permissions.includes(moduleKey);
}

function renderAuthUI() {
  if (!currentUser) {
    showLoginModal();
    return;
  }

  hideLoginModal();

  const roleDef = ROLE_DEFINITIONS[currentUser.role] || ROLE_DEFINITIONS.STAFF;
  const initials = currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  // Update Topbar User Profile Widget
  const topUserBox = document.getElementById('topbar-user-profile');
  if (topUserBox) {
    topUserBox.innerHTML = `
      <div class="relative group">
        <button class="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-colors">
          <div class="text-right hidden sm:block">
            <div class="text-xs font-bold text-slate-900 leading-tight">${escapeHtml(currentUser.name)}</div>
            <div class="text-[10px] text-slate-500 font-medium">${escapeHtml(roleDef.label)}</div>
          </div>
          <div class="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
            ${initials}
          </div>
          <i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>
        </button>

        <!-- Dropdown Menu -->
        <div class="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 hidden group-hover:block hover:block">
          <div class="px-3.5 py-2 border-b border-slate-100 text-xs">
            <div class="font-bold text-slate-900">${escapeHtml(currentUser.name)}</div>
            <div class="text-[11px] text-slate-400 font-mono truncate">${escapeHtml(currentUser.email)}</div>
            <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${roleDef.badgeClass}">
              ${roleDef.label}
            </span>
          </div>

          <div class="border-t border-slate-100 pt-1">
            <button onclick="handleLogout()" class="w-full text-left px-3.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2">
              <i class="fa-solid fa-arrow-right-from-bracket"></i>
              <span>Keluar (Logout)</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Update Sidebar Bottom User Badge
  const sbUser = document.getElementById('sidebar-user-footer');
  if (sbUser) {
    sbUser.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold flex items-center justify-center text-xs shrink-0">
            ${initials}
          </div>
          <div class="overflow-hidden">
            <div class="text-xs font-bold text-white truncate leading-tight">${escapeHtml(currentUser.name)}</div>
            <div class="text-[10px] text-blue-400 font-medium truncate">${escapeHtml(roleDef.label)}</div>
          </div>
        </div>
        <button onclick="handleLogout()" title="Keluar" class="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
          <i class="fa-solid fa-power-off text-xs"></i>
        </button>
      </div>
    `;
  }

  // Dynamically show/hide navigation items based on role permissions
  toggleNavByPermission('invoices', hasPermission('invoices'));
  toggleNavByPermission('accounting', hasPermission('accounting'));
  toggleNavByPermission('employees', hasPermission('employees'));
  toggleNavByPermission('payroll', hasPermission('payroll'));
  toggleNavByPermission('assets', hasPermission('assets'));
  toggleNavByPermission('users', hasPermission('users'));
  toggleNavByPermission('settings', hasPermission('settings'));

  // Adjust label for staff
  const navPayrollSpan = document.querySelector('#nav-payroll span');
  if (navPayrollSpan) {
    navPayrollSpan.textContent = currentUser.role === 'STAFF' ? 'Slip Gaji Saya' : 'Penggajian & Slip Gaji';
  }

  const navAssetsSpan = document.querySelector('#nav-assets span');
  if (navAssetsSpan) {
    navAssetsSpan.textContent = currentUser.role === 'STAFF' ? 'Aset Pegangan Saya' : 'Aset Perusahaan';
  }

  // If current page is unauthorized for this role, bounce to dashboard
  const currentHash = window.location.hash.replace('#', '') || 'dashboard';
  if (!hasPermission(currentHash)) {
    navigate('dashboard');
  }
}

function toggleNavByPermission(navKey, allow) {
  const el = document.getElementById(`nav-${navKey}`);
  if (!el) return;
  if (allow) {
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await API.post('/api/auth/login', { email, password });
    if (res.success) {
      localStorage.setItem('auth_token', res.token);
      currentUser = res.user;
      showToast(res.message || 'Login berhasil!', 'success');
      renderAuthUI();
      navigate('dashboard');
    }
  } catch (err) {
    showToast('Gagal login: ' + err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await API.post('/api/auth/logout', {});
  } catch {}
  localStorage.removeItem('auth_token');
  currentUser = null;
  showToast('Anda telah keluar dari sistem.', 'info');
  renderAuthUI();
}

function showLoginModal() {
  openModal('modal-login-auth');
}

function hideLoginModal() {
  closeModal('modal-login-auth');
}