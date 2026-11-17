async function loadCompanySettings() {
  try {
    const res = await API.get('/api/company');
    if (!res.success) return;
    const comp = res.data;

    document.getElementById('set-company-name').value = comp.name || '';
    document.getElementById('set-company-tagline').value = comp.tagline || '';
    document.getElementById('set-company-address').value = comp.address || '';
    document.getElementById('set-company-phone').value = comp.phone || '';
    document.getElementById('set-company-email').value = comp.email || '';
    document.getElementById('set-company-website').value = comp.website || '';
    document.getElementById('set-company-npwp').value = comp.npwp || '';
    document.getElementById('set-bank-name').value = comp.bank_name || '';
    document.getElementById('set-bank-account').value = comp.bank_account_number || '';
    document.getElementById('set-bank-holder').value = comp.bank_account_holder || '';
    document.getElementById('set-tax-rate').value = comp.tax_rate !== undefined ? comp.tax_rate : 11;
  } catch (err) {
    showToast('Gagal memuat profil perusahaan: ' + err.message, 'error');
  }
}

async function saveCompanySettings(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById('set-company-name').value.trim(),
    tagline: document.getElementById('set-company-tagline').value.trim(),
    address: document.getElementById('set-company-address').value.trim(),
    phone: document.getElementById('set-company-phone').value.trim(),
    email: document.getElementById('set-company-email').value.trim(),
    website: document.getElementById('set-company-website').value.trim(),
    npwp: document.getElementById('set-company-npwp').value.trim(),
    bank_name: document.getElementById('set-bank-name').value.trim(),
    bank_account_number: document.getElementById('set-bank-account').value.trim(),
    bank_account_holder: document.getElementById('set-bank-holder').value.trim(),
    tax_rate: parseFloat(document.getElementById('set-tax-rate').value) || 11
  };

  try {
    const res = await API.put('/api/company', payload);
    showToast(res.message || 'Profil perusahaan berhasil disimpan!', 'success');
    
    // Update sidebar brand title
    const sb = document.getElementById('sidebar-company-name');
    if (sb) sb.textContent = payload.name;
    
    loadDashboard();
  } catch (err) {
    showToast('Gagal menyimpan profil: ' + err.message, 'error');
  }
}

async function handleImportBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = JSON.parse(event.target.result);
      await API.post('/api/backup/import', json);
      showToast('Data cadangan berhasil dipulihkan!', 'success');
      // Refresh all modules
      loadDashboard();
      loadInvoices();
      loadTransactions();
      loadEmployees();
      loadPayrolls();
      loadCompanySettings();
    } catch (err) {
      showToast('Gagal memulihkan file cadangan: Format JSON tidak sesuai', 'error');
    }
  };
  reader.readAsText(file);
}

async function handleResetSampleData() {
  if (!confirm('Peringatan: Seluruh data saat ini akan dikembalikan ke data sampel awal default. Lanjutkan?')) return;
  try {
    const res = await API.post('/api/backup/reset', {});
    showToast(res.message || 'Data berhasil dikembalikan ke default!', 'success');
    loadDashboard();
    loadInvoices();
    loadTransactions();
    loadEmployees();
    loadPayrolls();
    loadCompanySettings();
  } catch (err) {
    showToast('Gagal mereset data: ' + err.message, 'error');
  }
}
