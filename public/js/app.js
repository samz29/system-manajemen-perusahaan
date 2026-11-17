// Main Application Routing, Helpers & Orchestrator

const sectionTitles = {
  dashboard: {
    title: 'Dashboard Ringkasan',
    subtitle: 'Gambaran kinerja finansial & operasional perusahaan terkini'
  },
  invoices: {
    title: 'Faktur & Tagihan (Invoices)',
    subtitle: 'Manajemen penerbitan faktur penjualan, status lunas, dan cetak resmi A4'
  },
  accounting: {
    title: 'Buku Kas & Akuntansi Sederhana',
    subtitle: 'Pencatatan arus kas operasional dan Laporan Laba Rugi perusahaan'
  },
  employees: {
    title: 'Database Master Karyawan',
    subtitle: 'Kelola informasi pegawai, departemen, rekening bank, serta struktur gaji'
  },
  payroll: {
    title: 'Penggajian & Slip Gaji',
    subtitle: 'Perhitungan take-home pay, potongan BPJS & PPh 21, dan cetak slip gaji'
  },
  assets: {
    title: 'Manajemen Aset & Inventaris Perusahaan',
    subtitle: 'Pelacakan barang inventaris kantor, penanggung jawab (PIC), dan kalkulasi nilai buku (Metode Garis Lurus)'
  },
  users: {
    title: 'Hak Akses & Manajemen Pengguna (RBAC)',
    subtitle: 'Kelola akun pengguna, peran otorisasi, dan hak akses masing-masing modul sistem'
  },
  settings: {
    title: 'Pengaturan Profil Perusahaan & Cadangan',
    subtitle: 'Pengaturan kop surat, rekening resmi, dan ekspor/impor data'
  }
};

function navigate(section) {
  if (!sectionTitles[section]) section = 'dashboard';

  // Check role permission
  if (typeof hasPermission === 'function' && !hasPermission(section)) {
    showToast('Akses dibatasi: Anda tidak memiliki izin untuk modul ini', 'warning');
    section = 'dashboard';
  }

  // Update hash
  window.location.hash = section;

  // Toggle visible sections
  const sections = ['dashboard', 'invoices', 'accounting', 'employees', 'payroll', 'assets', 'users', 'settings'];
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    const nav = document.getElementById(`nav-${s}`);
    if (s === section) {
      if (el) el.classList.remove('hidden');
      if (nav) nav.classList.add('active');
    } else {
      if (el) el.classList.add('hidden');
      if (nav) nav.classList.remove('active');
    }
  });

  // Update Topbar
  const meta = sectionTitles[section];
  document.getElementById('topbar-title').textContent = meta.title;
  document.getElementById('topbar-subtitle').textContent = meta.subtitle;

  // Trigger section data reload
  if (section === 'dashboard') loadDashboard();
  else if (section === 'invoices') loadInvoices();
  else if (section === 'accounting') loadTransactions();
  else if (section === 'employees') loadEmployees();
  else if (section === 'payroll') loadPayrolls();
  else if (section === 'assets') loadAssets();
  else if (section === 'users') loadUsers();
  else if (section === 'settings') loadCompanySettings();
}

// Modal management
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

// Close modals when pressing Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
      closeModal(modal.id);
    });
  }
});

// Formatting Utilities
function formatRupiah(amount) {
  const num = Number(amount) || 0;
  return 'Rp ' + Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white border transition-all ${
    type === 'success' ? 'bg-emerald-600 border-emerald-500' :
    type === 'error' ? 'bg-rose-600 border-rose-500' :
    type === 'warning' ? 'bg-amber-600 border-amber-500' :
    'bg-slate-900 border-slate-800'
  }`;

  const icon = 
    type === 'success' ? '<i class="fa-solid fa-circle-check text-sm"></i>' :
    type === 'error' ? '<i class="fa-solid fa-circle-exclamation text-sm"></i>' :
    type === 'warning' ? '<i class="fa-solid fa-triangle-exclamation text-sm"></i>' :
    '<i class="fa-solid fa-circle-info text-sm"></i>';

  toast.innerHTML = `
    ${icon}
    <span>${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white ml-2">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Current date badge
function setupDateBadge() {
  const badge = document.getElementById('current-date-badge');
  if (badge) {
    const today = new Date();
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    badge.textContent = today.toLocaleDateString('id-ID', options);
  }
}

// Initialization on DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
  setupDateBadge();

  // Initialize Authentication & Roles first
  if (typeof initAuth === 'function') {
    await initAuth();
  }

  // Listen to hash change
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    navigate(hash);
  });

  // Initial load
  const initialHash = window.location.hash.replace('#', '') || 'dashboard';
  navigate(initialHash);
});
