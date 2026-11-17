require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Database selection: use PostgreSQL if configured, otherwise fallback to JSON
const USE_POSTGRES = !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);
const db = USE_POSTGRES ? require('./db-pg') : require('./db');

if (USE_POSTGRES) {
  console.log('🐘 Using PostgreSQL database');
} else {
  console.log('📄 Using JSON file database (fallback)');
}

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { success: false, message: "Terlalu banyak percobaan, coba lagi nanti" },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: "Terlalu banyak permintaan, coba lagi sebentar" },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', apiLimiter);
app.use('/api/', apiLimiter);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Auth Helper Functions
function getAuthToken(req) {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return req.headers['x-auth-token'] || null;
}

function authMiddleware(allowedRoles = []) {
  return (req, res, next) => {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Sesi login tidak ditemukan. Harap masuk terlebih dahulu." });
    }
    const user = db.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ success: false, message: "Sesi Anda telah kedaluwarsa. Silakan masuk kembali." });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: `Akses ditolak: Peran ${user.role} tidak memiliki hak akses untuk tindakan ini.` });
    }
    req.user = user;
    next();
  };
}

function optionalAuth(req, res, next) {
  const token = getAuthToken(req);
  if (token) {
    req.user = db.getUserByToken(token);
  }
  next();
}

// 0. Authentication Routes
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const result = db.authenticateUser(email, password);
    res.json({ success: true, ...result, message: `Selamat datang kembali, ${result.user.name}!` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', authMiddleware(), (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getAuthToken(req);
  db.logoutUser(token);
  res.json({ success: true, message: "Berhasil keluar" });
});

// User Management Routes (SUPER_ADMIN only)
app.get('/api/users', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const users = db.getUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/users', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const user = db.createUser(req.body);
    res.status(201).json({ success: true, data: user, message: "Pengguna berhasil ditambahkan" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/users/:id', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const updated = db.updateUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Pengguna tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Data pengguna berhasil diperbarui" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/users/:id', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const ok = db.deleteUser(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Pengguna tidak ditemukan" });
    res.json({ success: true, message: "Pengguna berhasil dihapus" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// API Routes

// 1. Dashboard
app.get('/api/dashboard', authMiddleware(), (req, res) => {
  try {
    const summary = db.getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Company Profile
app.get('/api/company', authMiddleware(), (req, res) => {
  try {
    const company = db.getCompany();
    res.json({ success: true, data: company });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/company', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const updated = db.updateCompany(req.body);
    res.json({ success: true, data: updated, message: "Profil perusahaan berhasil diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Invoices
app.get('/api/invoices', authMiddleware(), (req, res) => {
  try {
    const invoices = db.getInvoices();
    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/invoices/:id', authMiddleware(), (req, res) => {
  try {
    const inv = db.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: "Faktur tidak ditemukan" });
    res.json({ success: true, data: inv });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/invoices', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const created = db.createInvoice(req.body);
    res.status(201).json({ success: true, data: created, message: "Faktur berhasil diterbitkan" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/invoices/:id', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const updated = db.updateInvoice(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Faktur tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Faktur berhasil diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/invoices/:id/pay', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const { payment_method, payment_date } = req.body;
    const updated = db.updateInvoice(req.params.id, {
      status: 'Lunas',
      payment_method: payment_method || 'Transfer Bank',
      payment_date: payment_date || new Date().toISOString().split('T')[0]
    });
    if (!updated) return res.status(404).json({ success: false, message: "Faktur tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Faktur berhasil ditandai lunas dan tercatat dalam kas masuk!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/invoices/:id', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const ok = db.deleteInvoice(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Faktur tidak ditemukan" });
    res.json({ success: true, message: "Faktur berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Accounting / Transactions
app.get('/api/accounting/transactions', authMiddleware(), (req, res) => {
  try {
    const { type, category, startDate, endDate } = req.query;
    const txs = db.getTransactions({ type, category, startDate, endDate });
    res.json({ success: true, data: txs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/accounting/transactions', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const created = db.createTransaction(req.body);
    res.status(201).json({ success: true, data: created, message: "Transaksi berhasil dicatat" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/accounting/transactions/:id', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const ok = db.deleteTransaction(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan" });
    res.json({ success: true, message: "Transaksi berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/accounting/report', authMiddleware(['SUPER_ADMIN', 'FINANCE']), (req, res) => {
  try {
    const report = db.getAccountingReport(req.query.period);
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Employees
app.get('/api/employees', authMiddleware(), (req, res) => {
  try {
    const employees = db.getEmployees();
    res.json({ success: true, data: employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/employees/:id', authMiddleware(), (req, res) => {
  try {
    const emp = db.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: "Karyawan tidak ditemukan" });
    res.json({ success: true, data: emp });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/employees', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const created = db.createEmployee(req.body);
    res.status(201).json({ success: true, data: created, message: "Data karyawan berhasil disimpan" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/employees/:id', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const updated = db.updateEmployee(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Karyawan tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Data karyawan berhasil diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/employees/:id', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const ok = db.deleteEmployee(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Karyawan tidak ditemukan" });
    res.json({ success: true, message: "Karyawan berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Payroll
app.get('/api/payrolls', authMiddleware(), (req, res) => {
  try {
    const { period } = req.query;
    let payrolls = db.getPayrolls(period);
    if (req.user && req.user.role === 'STAFF' && req.user.employee_id) {
      payrolls = payrolls.filter(p => p.employee_id === req.user.employee_id);
    }
    res.json({ success: true, data: payrolls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/payrolls/:id', authMiddleware(), (req, res) => {
  try {
    const pay = db.getPayrollById(req.params.id);
    if (!pay) return res.status(404).json({ success: false, message: "Data slip gaji tidak ditemukan" });
    res.json({ success: true, data: pay });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payrolls', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const created = db.createPayroll(req.body);
    res.status(201).json({ success: true, data: created, message: "Slip gaji berhasil dibuat" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payrolls/generate-batch', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return res.status(400).json({ success: false, message: "Periode bulan wajib diisi" });
    const result = db.generateBatchPayroll(period);
    res.json({ 
      success: true, 
      data: result, 
      message: `Berhasil generate ${result.generated_count} slip gaji untuk periode ${period}` 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/payrolls/:id', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const updated = db.updatePayroll(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Slip gaji tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Slip gaji berhasil diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payrolls/:id/pay', authMiddleware(['SUPER_ADMIN', 'HR', 'FINANCE']), (req, res) => {
  try {
    const updated = db.updatePayroll(req.params.id, {
      status: 'Dibayar',
      payment_date: req.body.payment_date || new Date().toISOString().split('T')[0],
      payment_method: req.body.payment_method || 'Transfer Bank'
    });
    if (!updated) return res.status(404).json({ success: false, message: "Slip gaji tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Gaji berhasil ditandai dibayar dan otomatis tercatat di pengeluaran akuntansi!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/payrolls/:id', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const ok = db.deletePayroll(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Data gaji tidak ditemukan" });
    res.json({ success: true, message: "Data gaji berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Company Assets (Aset Perusahaan)
app.get('/api/assets', authMiddleware(), (req, res) => {
  try {
    const { category, condition, search } = req.query;
    let assets = db.getAssets({ category, condition, search });
    if (req.user && req.user.role === 'STAFF' && req.user.employee_id) {
      assets = assets.filter(a => a.assigned_to_id === req.user.employee_id);
    }
    res.json({ success: true, data: assets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/assets/:id', authMiddleware(), (req, res) => {
  try {
    const asset = db.getAssetById(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: "Aset tidak ditemukan" });
    res.json({ success: true, data: asset });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/assets', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const created = db.createAsset(req.body);
    res.status(201).json({ success: true, data: created, message: "Aset berhasil ditambahkan ke inventaris!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/assets/:id', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const updated = db.updateAsset(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Aset tidak ditemukan" });
    res.json({ success: true, data: updated, message: "Data aset berhasil diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/assets/:id', authMiddleware(['SUPER_ADMIN', 'HR']), (req, res) => {
  try {
    const ok = db.deleteAsset(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Aset tidak ditemukan" });
    res.json({ success: true, message: "Aset berhasil dihapus dari inventaris" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Backup & Restore
app.get('/api/backup/export', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const data = db.exportData();
    res.setHeader('Content-disposition', 'attachment; filename=perusahaan_backup_' + new Date().toISOString().split('T')[0] + '.json');
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/backup/import', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    db.importData(req.body);
    res.json({ success: true, message: "Data cadangan berhasil dipulihkan!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/backup/reset', authMiddleware(['SUPER_ADMIN']), (req, res) => {
  try {
    const data = db.resetSampleData();
    res.json({ success: true, message: "Data sample berhasil di-reset ke nilai default!", data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server Manajemen Perusahaan berjalan di http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
  
  if (USE_POSTGRES && db.closePool) {
    try {
      await db.closePool();
      console.log('✅ PostgreSQL pool closed');
    } catch (err) {
      console.error('❌ Error closing PostgreSQL pool:', err);
    }
  }
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);