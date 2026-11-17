const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data', 'database.json');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

const defaultSampleData = {
  company: {
    name: "PT Sinar Digital Nusantara",
    tagline: "Solusi Teknologi & Layanan Manajemen Bisnis",
    address: "Gedung Cyber 2 Lantai 12, Jl. H.R. Rasuna Said Blok X-5, Kuningan, Jakarta Selatan 12950",
    phone: "+62 21 555-0899",
    email: "finance@sinardigital.co.id",
    website: "https://sinardigital.co.id",
    npwp: "01.345.678.9-012.000",
    bank_name: "Bank Central Asia (BCA)",
    bank_account_number: "8801-9234-5561",
    bank_account_holder: "PT SINAR DIGITAL NUSANTARA",
    currency: "IDR",
    currency_symbol: "Rp",
    tax_rate: 11 // PPN 11%
  },
  employees: [],
  invoices: [],
  transactions: [],
  payrolls: [],
  assets: [],
  users: [],
  sessions: {}
};

function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password), hash);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password) + '_salt_sinar_2026').digest('hex');
}

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultSampleData, null, 2), 'utf-8');
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const db = JSON.parse(raw);
    let changed = false;
    if (!db.assets) {
      db.assets = defaultSampleData.assets;
      changed = true;
    }
    if (!db.users || !db.users.length) {
      db.users = defaultSampleData.users;
      changed = true;
    }
    if (!db.sessions) {
      db.sessions = {};
      changed = true;
    }
    if (changed) {
      writeDb(db);
    }
    return db;
  } catch (err) {
    console.error("Error reading database, restoring defaults:", err);
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultSampleData, null, 2), 'utf-8');
    return defaultSampleData;
  }
}

function writeDb(data) {
  ensureDb();
  const tempPath = DB_PATH + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_PATH);
}

// Company API
function getCompany() {
  const db = readDb();
  return db.company;
}

function updateCompany(patch) {
  const db = readDb();
  db.company = { ...db.company, ...patch };
  writeDb(db);
  return db.company;
}

// Invoices API
function getInvoices() {
  const db = readDb();
  return db.invoices || [];
}

function getInvoiceById(id) {
  const db = readDb();
  return (db.invoices || []).find(inv => inv.id === id);
}

function createInvoice(payload) {
  const db = readDb();
  db.invoices = db.invoices || [];
  
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(db.invoices.length + 1).padStart(3, '0');
  const invoiceNumber = payload.invoice_number || `INV/${yearMonth}/${seq}`;
  const id = `INV-${yearMonth}-${seq}-${crypto.randomBytes(2).toString('hex')}`;

  // Recalculate totals
  const items = (payload.items || []).map((it, idx) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unit_price) || 0;
    const disc = Number(it.discount_percent) || 0;
    const lineTotal = qty * price * (1 - disc / 100);
    return {
      id: it.id || `item-${idx + 1}`,
      description: it.description || 'Deskripsi Item',
      quantity: qty,
      unit: it.unit || 'Unit',
      unit_price: price,
      discount_percent: disc,
      total: lineTotal
    };
  });

  const subtotal = items.reduce((acc, it) => acc + it.total, 0);
  const taxRate = payload.tax_rate !== undefined ? Number(payload.tax_rate) : (db.company.tax_rate || 11);
  const discountAmount = Number(payload.discount_amount) || 0;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxableAmount * taxRate) / 100;
  const grandTotal = taxableAmount + taxAmount;

  const newInvoice = {
    id,
    invoice_number: invoiceNumber,
    date: payload.date || now.toISOString().split('T')[0],
    due_date: payload.due_date || now.toISOString().split('T')[0],
    status: payload.status || 'Draft',
    client: {
      name: payload.client?.name || 'Nama Pelanggan',
      attn: payload.client?.attn || '',
      email: payload.client?.email || '',
      phone: payload.client?.phone || '',
      address: payload.client?.address || ''
    },
    items,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    grand_total: grandTotal,
    notes: payload.notes || 'Terima kasih atas kerja samanya.',
    payment_date: payload.status === 'Lunas' ? (payload.payment_date || now.toISOString().split('T')[0]) : null,
    payment_method: payload.status === 'Lunas' ? (payload.payment_method || 'Transfer Bank') : null,
    created_at: now.toISOString()
  };

  db.invoices.unshift(newInvoice);

  // If marked paid upon creation, auto-record transaction
  if (newInvoice.status === 'Lunas') {
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: `TRX-${Date.now()}`,
      date: newInvoice.payment_date,
      type: "Pemasukan",
      category: "Pembayaran Faktur",
      amount: newInvoice.grand_total,
      description: `Pelunasan Faktur ${newInvoice.invoice_number} - ${newInvoice.client.name}`,
      payment_method: newInvoice.payment_method || 'Transfer Bank',
      reference: newInvoice.invoice_number,
      created_at: now.toISOString()
    });
  }

  writeDb(db);
  return newInvoice;
}

function updateInvoice(id, payload) {
  const db = readDb();
  db.invoices = db.invoices || [];
  const idx = db.invoices.findIndex(inv => inv.id === id);
  if (idx === -1) return null;

  const prev = db.invoices[idx];

  // Recalculate totals
  const items = (payload.items || prev.items || []).map((it, i) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unit_price) || 0;
    const disc = Number(it.discount_percent) || 0;
    const lineTotal = qty * price * (1 - disc / 100);
    return {
      id: it.id || `item-${i + 1}`,
      description: it.description || 'Deskripsi Item',
      quantity: qty,
      unit: it.unit || 'Unit',
      unit_price: price,
      discount_percent: disc,
      total: lineTotal
    };
  });

  const subtotal = items.reduce((acc, it) => acc + it.total, 0);
  const taxRate = payload.tax_rate !== undefined ? Number(payload.tax_rate) : (prev.tax_rate || 11);
  const discountAmount = payload.discount_amount !== undefined ? Number(payload.discount_amount) : (prev.discount_amount || 0);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxableAmount * taxRate) / 100;
  const grandTotal = taxableAmount + taxAmount;

  const wasPaid = prev.status === 'Lunas';
  const isPaid = payload.status === 'Lunas';

  const updatedInvoice = {
    ...prev,
    ...payload,
    items,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    grand_total: grandTotal,
    client: {
      ...prev.client,
      ...(payload.client || {})
    }
  };

  // If status changed to Lunas from non-lunas, record transaction
  if (!wasPaid && isPaid) {
    const now = new Date();
    updatedInvoice.payment_date = payload.payment_date || now.toISOString().split('T')[0];
    updatedInvoice.payment_method = payload.payment_method || 'Transfer Bank';
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: `TRX-${Date.now()}`,
      date: updatedInvoice.payment_date,
      type: "Pemasukan",
      category: "Pembayaran Faktur",
      amount: updatedInvoice.grand_total,
      description: `Pelunasan Faktur ${updatedInvoice.invoice_number} - ${updatedInvoice.client.name}`,
      payment_method: updatedInvoice.payment_method,
      reference: updatedInvoice.invoice_number,
      created_at: now.toISOString()
    });
  }

  db.invoices[idx] = updatedInvoice;
  writeDb(db);
  return updatedInvoice;
}

function deleteInvoice(id) {
  const db = readDb();
  db.invoices = db.invoices || [];
  const idx = db.invoices.findIndex(inv => inv.id === id);
  if (idx === -1) return false;
  db.invoices.splice(idx, 1);
  writeDb(db);
  return true;
}

// Transactions / Accounting API
function getTransactions(filters = {}) {
  const db = readDb();
  let list = db.transactions || [];

  if (filters.type && filters.type !== 'Semua') {
    list = list.filter(t => t.type === filters.type);
  }
  if (filters.category && filters.category !== 'Semua') {
    list = list.filter(t => t.category === filters.category);
  }
  if (filters.startDate) {
    list = list.filter(t => t.date >= filters.startDate);
  }
  if (filters.endDate) {
    list = list.filter(t => t.date <= filters.endDate);
  }

  // Sort newest date first
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function createTransaction(payload) {
  const db = readDb();
  db.transactions = db.transactions || [];

  const now = new Date();
  const newTx = {
    id: `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: payload.date || now.toISOString().split('T')[0],
    type: payload.type === 'Pemasukan' ? 'Pemasukan' : 'Pengeluaran',
    category: payload.category || 'Lain-lain',
    amount: Number(payload.amount) || 0,
    description: payload.description || '',
    payment_method: payload.payment_method || 'Kas Tunai',
    reference: payload.reference || '',
    created_at: now.toISOString()
  };

  db.transactions.unshift(newTx);
  writeDb(db);
  return newTx;
}

function deleteTransaction(id) {
  const db = readDb();
  db.transactions = db.transactions || [];
  const idx = db.transactions.findIndex(t => t.id === id);
  if (idx === -1) return false;
  db.transactions.splice(idx, 1);
  writeDb(db);
  return true;
}

function getAccountingReport(periodFilter) {
  const db = readDb();
  const txs = db.transactions || [];

  let totalIncome = 0;
  let totalExpense = 0;
  const incomeCategories = {};
  const expenseCategories = {};

  txs.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'Pemasukan') {
      totalIncome += amt;
      incomeCategories[t.category] = (incomeCategories[t.category] || 0) + amt;
    } else {
      totalExpense += amt;
      expenseCategories[t.category] = (expenseCategories[t.category] || 0) + amt;
    }
  });

  const netProfit = totalIncome - totalExpense;

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    net_profit: netProfit,
    income_categories: incomeCategories,
    expense_categories: expenseCategories,
    transaction_count: txs.length
  };
}

// Employees API
function getEmployees() {
  const db = readDb();
  return db.employees || [];
}

function getEmployeeById(id) {
  const db = readDb();
  return (db.employees || []).find(e => e.id === id);
}

function createEmployee(payload) {
  const db = readDb();
  db.employees = db.employees || [];

  const seq = String(db.employees.length + 1).padStart(3, '0');
  const id = payload.id || `EMP-${seq}`;

  const newEmp = {
    id,
    name: payload.name || 'Nama Karyawan',
    email: payload.email || '',
    phone: payload.phone || '',
    position: payload.position || 'Staff',
    department: payload.department || 'Umum',
    employment_type: payload.employment_type || 'Tetap',
    join_date: payload.join_date || new Date().toISOString().split('T')[0],
    status: payload.status || 'Aktif',
    bank_name: payload.bank_name || 'BCA',
    bank_account: payload.bank_account || '',
    basic_salary: Number(payload.basic_salary) || 0,
    allowance_transport: Number(payload.allowance_transport) || 0,
    allowance_meal: Number(payload.allowance_meal) || 0,
    allowance_position: Number(payload.allowance_position) || 0,
    bpjs_kesehatan: Number(payload.bpjs_kesehatan) || 0,
    bpjs_ketenagakerjaan: Number(payload.bpjs_ketenagakerjaan) || 0
  };

  db.employees.push(newEmp);
  writeDb(db);
  return newEmp;
}

function updateEmployee(id, payload) {
  const db = readDb();
  db.employees = db.employees || [];
  const idx = db.employees.findIndex(e => e.id === id);
  if (idx === -1) return null;

  const prev = db.employees[idx];
  const updated = {
    ...prev,
    ...payload,
    basic_salary: payload.basic_salary !== undefined ? Number(payload.basic_salary) : prev.basic_salary,
    allowance_transport: payload.allowance_transport !== undefined ? Number(payload.allowance_transport) : prev.allowance_transport,
    allowance_meal: payload.allowance_meal !== undefined ? Number(payload.allowance_meal) : prev.allowance_meal,
    allowance_position: payload.allowance_position !== undefined ? Number(payload.allowance_position) : prev.allowance_position,
    bpjs_kesehatan: payload.bpjs_kesehatan !== undefined ? Number(payload.bpjs_kesehatan) : prev.bpjs_kesehatan,
    bpjs_ketenagakerjaan: payload.bpjs_ketenagakerjaan !== undefined ? Number(payload.bpjs_ketenagakerjaan) : prev.bpjs_ketenagakerjaan
  };

  db.employees[idx] = updated;
  writeDb(db);
  return updated;
}

function deleteEmployee(id) {
  const db = readDb();
  db.employees = db.employees || [];
  const idx = db.employees.findIndex(e => e.id === id);
  if (idx === -1) return false;
  db.employees.splice(idx, 1);
  writeDb(db);
  return true;
}

// Payroll API
function getPayrolls(period) {
  const db = readDb();
  let list = db.payrolls || [];
  if (period) {
    list = list.filter(p => p.period === period);
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getPayrollById(id) {
  const db = readDb();
  return (db.payrolls || []).find(p => p.id === id);
}

function calculatePayrollValues(emp, bonus = 0, overtime = 0, deductionOther = 0) {
  const basicSalary = Number(emp.basic_salary) || 0;
  const transport = Number(emp.allowance_transport) || 0;
  const meal = Number(emp.allowance_meal) || 0;
  const position = Number(emp.allowance_position) || 0;
  const totalAllowance = transport + meal + position;

  const numBonus = Number(bonus) || 0;
  const numOvertime = Number(overtime) || 0;
  const grossSalary = basicSalary + totalAllowance + numBonus + numOvertime;

  const bpjsKs = Number(emp.bpjs_kesehatan) || 0;
  const bpjsTk = Number(emp.bpjs_ketenagakerjaan) || 0;
  // Estimasi PPh 21 sederhana (5% dari PKP di atas PTKP Rp 4.500.000 / bulan)
  const taxableIncomeMonth = Math.max(0, grossSalary - 4500000);
  const estimatedPph21 = Math.round(taxableIncomeMonth * 0.05);

  const numDeductionOther = Number(deductionOther) || 0;
  const totalDeduction = bpjsKs + bpjsTk + estimatedPph21 + numDeductionOther;
  const netSalary = Math.max(0, grossSalary - totalDeduction);

  return {
    basic_salary: basicSalary,
    allowance_transport: transport,
    allowance_meal: meal,
    allowance_position: position,
    total_allowance: totalAllowance,
    bonus: numBonus,
    overtime: numOvertime,
    gross_salary: grossSalary,
    deduction_bpjs_ks: bpjsKs,
    deduction_bpjs_tk: bpjsTk,
    deduction_pph21: estimatedPph21,
    deduction_other: numDeductionOther,
    total_deduction: totalDeduction,
    net_salary: netSalary
  };
}

function createPayroll(payload) {
  const db = readDb();
  db.payrolls = db.payrolls || [];

  const emp = (db.employees || []).find(e => e.id === payload.employee_id);
  if (!emp) throw new Error("Karyawan tidak ditemukan");

  const calc = calculatePayrollValues(
    emp,
    payload.bonus,
    payload.overtime,
    payload.deduction_other
  );

  const now = new Date();
  const period = payload.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const [pYear, pMonth] = period.split('-');
  const periodLabel = `${monthNames[parseInt(pMonth, 10) - 1]} ${pYear}`;

  const id = `PAY-${period.replace('-', '')}-${emp.id}-${Date.now().toString().slice(-4)}`;

  const newPayroll = {
    id,
    period,
    period_label: periodLabel,
    employee_id: emp.id,
    employee_name: emp.name,
    employee_position: emp.position,
    employee_department: emp.department,
    ...calc,
    status: payload.status || 'Draft',
    payment_date: payload.status === 'Dibayar' ? (payload.payment_date || now.toISOString().split('T')[0]) : null,
    payment_method: payload.payment_method || `Transfer ${emp.bank_name} (${emp.bank_account})`,
    notes: payload.notes || '',
    created_at: now.toISOString()
  };

  db.payrolls.unshift(newPayroll);

  if (newPayroll.status === 'Dibayar') {
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: `TRX-${Date.now()}`,
      date: newPayroll.payment_date,
      type: "Pengeluaran",
      category: "Beban Gaji Karyawan",
      amount: newPayroll.net_salary,
      description: `Gaji ${newPayroll.period_label} - ${newPayroll.employee_name} (${newPayroll.employee_id})`,
      payment_method: newPayroll.payment_method,
      reference: newPayroll.id,
      created_at: now.toISOString()
    });
  }

  writeDb(db);
  return newPayroll;
}

function updatePayroll(id, payload) {
  const db = readDb();
  db.payrolls = db.payrolls || [];
  const idx = db.payrolls.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const prev = db.payrolls[idx];
  const wasPaid = prev.status === 'Dibayar';
  const isPaid = payload.status === 'Dibayar';

  const updatedPayroll = {
    ...prev,
    ...payload
  };

  // If status marked Dibayar
  if (!wasPaid && isPaid) {
    const now = new Date();
    updatedPayroll.payment_date = payload.payment_date || now.toISOString().split('T')[0];
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: `TRX-${Date.now()}`,
      date: updatedPayroll.payment_date,
      type: "Pengeluaran",
      category: "Beban Gaji Karyawan",
      amount: updatedPayroll.net_salary,
      description: `Gaji ${updatedPayroll.period_label} - ${updatedPayroll.employee_name} (${updatedPayroll.employee_id})`,
      payment_method: updatedPayroll.payment_method,
      reference: updatedPayroll.id,
      created_at: now.toISOString()
    });
  }

  db.payrolls[idx] = updatedPayroll;
  writeDb(db);
  return updatedPayroll;
}

function generateBatchPayroll(period) {
  const db = readDb();
  db.payrolls = db.payrolls || [];
  const activeEmployees = (db.employees || []).filter(e => e.status === 'Aktif');

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const [pYear, pMonth] = period.split('-');
  const periodLabel = `${monthNames[parseInt(pMonth, 10) - 1]} ${pYear}`;
  const now = new Date();

  const generated = [];

  activeEmployees.forEach(emp => {
    // Check if payroll already exists for this employee in this period
    const exists = db.payrolls.find(p => p.period === period && p.employee_id === emp.id);
    if (!exists) {
      const calc = calculatePayrollValues(emp, 0, 0, 0);
      const id = `PAY-${period.replace('-', '')}-${emp.id}`;
      const item = {
        id,
        period,
        period_label: periodLabel,
        employee_id: emp.id,
        employee_name: emp.name,
        employee_position: emp.position,
        employee_department: emp.department,
        ...calc,
        status: "Siap Bayar",
        payment_date: null,
        payment_method: `Transfer ${emp.bank_name} (${emp.bank_account})`,
        notes: `Generate otomatis periode ${periodLabel}`,
        created_at: now.toISOString()
      };
      db.payrolls.unshift(item);
      generated.push(item);
    }
  });

  writeDb(db);
  return {
    generated_count: generated.length,
    payrolls: generated
  };
}

function deletePayroll(id) {
  const db = readDb();
  db.payrolls = db.payrolls || [];
  const idx = db.payrolls.findIndex(p => p.id === id);
  if (idx === -1) return false;
  db.payrolls.splice(idx, 1);
  writeDb(db);
  return true;
}

// Company Assets (Aset Perusahaan) API
function calculateAssetDepreciation(asset) {
  const purchasePrice = Number(asset.purchase_price) || 0;
  const salvageValue = Number(asset.salvage_value) || 0;
  const usefulLifeYears = Number(asset.useful_life_years) || 4;
  const totalUsefulMonths = Math.max(1, usefulLifeYears * 12);

  const purchaseDate = new Date(asset.purchase_date || Date.now());
  const now = new Date();
  
  // Calculate months elapsed
  const yearsDiff = now.getFullYear() - purchaseDate.getFullYear();
  const monthsDiff = now.getMonth() - purchaseDate.getMonth();
  const monthsElapsed = Math.max(0, yearsDiff * 12 + monthsDiff);

  const depreciableAmount = Math.max(0, purchasePrice - salvageValue);
  const monthlyDepreciation = depreciableAmount / totalUsefulMonths;
  const effectiveMonths = Math.min(monthsElapsed, totalUsefulMonths);
  
  const accumulatedDepreciation = Math.round(effectiveMonths * monthlyDepreciation);
  const currentBookValue = Math.max(salvageValue, purchasePrice - accumulatedDepreciation);
  const depreciationPercent = depreciableAmount > 0 
    ? Math.min(100, Math.round((accumulatedDepreciation / depreciableAmount) * 100))
    : 0;

  return {
    ...asset,
    months_elapsed: monthsElapsed,
    total_useful_months: totalUsefulMonths,
    monthly_depreciation: Math.round(monthlyDepreciation),
    accumulated_depreciation: accumulatedDepreciation,
    current_book_value: currentBookValue,
    depreciation_percent: depreciationPercent,
    is_fully_depreciated: monthsElapsed >= totalUsefulMonths
  };
}

function getAssets(filters = {}) {
  const db = readDb();
  let list = (db.assets || []).map(calculateAssetDepreciation);

  if (filters.category && filters.category !== 'Semua') {
    list = list.filter(a => a.category === filters.category);
  }
  if (filters.condition && filters.condition !== 'Semua') {
    list = list.filter(a => a.condition === filters.condition);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(a => 
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.id && a.id.toLowerCase().includes(q)) ||
      (a.serial_number && a.serial_number.toLowerCase().includes(q)) ||
      (a.assigned_to_name && a.assigned_to_name.toLowerCase().includes(q)) ||
      (a.location && a.location.toLowerCase().includes(q))
    );
  }

  return list;
}

function getAssetById(id) {
  const db = readDb();
  const found = (db.assets || []).find(a => a.id === id);
  return found ? calculateAssetDepreciation(found) : null;
}

function createAsset(payload) {
  const db = readDb();
  db.assets = db.assets || [];

  const now = new Date();
  const seq = String(db.assets.length + 1).padStart(3, '0');
  
  let catPrefix = 'AST';
  if (payload.category === 'Elektronik & Komputer') catPrefix = 'AST-IT';
  else if (payload.category === 'Kendaraan Operasional') catPrefix = 'AST-VEH';
  else if (payload.category === 'Furnitur & Peralatan Kantor') catPrefix = 'AST-OFF';
  else if (payload.category === 'Mesin & Infrastruktur') catPrefix = 'AST-EQP';
  
  const id = payload.id || `${catPrefix}-${seq}`;

  // Link employee name if assigned_to_id provided
  let assignedName = payload.assigned_to_name || '-';
  if (payload.assigned_to_id) {
    const emp = (db.employees || []).find(e => e.id === payload.assigned_to_id);
    if (emp) assignedName = emp.name;
  }

  const newAsset = {
    id,
    name: payload.name || 'Aset Baru',
    category: payload.category || 'Elektronik & Komputer',
    purchase_date: payload.purchase_date || now.toISOString().split('T')[0],
    purchase_price: Number(payload.purchase_price) || 0,
    useful_life_years: Number(payload.useful_life_years) || 4,
    salvage_value: Number(payload.salvage_value) || 0,
    assigned_to_id: payload.assigned_to_id || null,
    assigned_to_name: assignedName,
    location: payload.location || 'Kantor Pusat',
    condition: payload.condition || 'Baik', // Sangat Baik, Baik, Dalam Perbaikan, Rusak / Usang
    serial_number: payload.serial_number || '-',
    vendor: payload.vendor || '-',
    notes: payload.notes || '',
    created_at: now.toISOString()
  };

  db.assets.unshift(newAsset);

  // If user requested to record CapEx expense in Accounting
  if (payload.record_expense && newAsset.purchase_price > 0) {
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: `TRX-${Date.now()}`,
      date: newAsset.purchase_date,
      type: "Pengeluaran",
      category: "Peralatan & Perlengkapan Kantor",
      amount: newAsset.purchase_price,
      description: `Pengadaan Aset (${newAsset.id}): ${newAsset.name}`,
      payment_method: payload.payment_method || "Transfer Bank BCA",
      reference: newAsset.id,
      created_at: now.toISOString()
    });
  }

  writeDb(db);
  return calculateAssetDepreciation(newAsset);
}

function updateAsset(id, payload) {
  const db = readDb();
  db.assets = db.assets || [];
  const idx = db.assets.findIndex(a => a.id === id);
  if (idx === -1) return null;

  const prev = db.assets[idx];

  let assignedName = payload.assigned_to_name || prev.assigned_to_name;
  if (payload.assigned_to_id && payload.assigned_to_id !== prev.assigned_to_id) {
    const emp = (db.employees || []).find(e => e.id === payload.assigned_to_id);
    if (emp) assignedName = emp.name;
  }

  const updated = {
    ...prev,
    ...payload,
    assigned_to_name: assignedName,
    purchase_price: payload.purchase_price !== undefined ? Number(payload.purchase_price) : prev.purchase_price,
    useful_life_years: payload.useful_life_years !== undefined ? Number(payload.useful_life_years) : prev.useful_life_years,
    salvage_value: payload.salvage_value !== undefined ? Number(payload.salvage_value) : prev.salvage_value
  };

  db.assets[idx] = updated;
  writeDb(db);
  return calculateAssetDepreciation(updated);
}

function deleteAsset(id) {
  const db = readDb();
  db.assets = db.assets || [];
  const idx = db.assets.findIndex(a => a.id === id);
  if (idx === -1) return false;
  db.assets.splice(idx, 1);
  writeDb(db);
  return true;
}

// Dashboard Summary
function getDashboardSummary() {
  const db = readDb();
  const invoices = db.invoices || [];
  const transactions = db.transactions || [];
  const employees = db.employees || [];
  const payrolls = db.payrolls || [];
  const assets = (db.assets || []).map(calculateAssetDepreciation);

  // Total Invoiced & Unpaid Invoices
  let totalInvoiced = 0;
  let unpaidInvoiceAmount = 0;
  let unpaidInvoiceCount = 0;

  invoices.forEach(inv => {
    totalInvoiced += inv.grand_total;
    if (inv.status === 'Terkirim' || inv.status === 'Jatuh Tempo') {
      unpaidInvoiceAmount += inv.grand_total;
      unpaidInvoiceCount += 1;
    }
  });

  // Total Income & Expense
  let totalIncome = 0;
  let totalExpense = 0;
  transactions.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'Pemasukan') totalIncome += amt;
    else totalExpense += amt;
  });

  const netProfit = totalIncome - totalExpense;

  // Active Employees count
  const activeEmployees = employees.filter(e => e.status === 'Aktif');
  const monthlySalaryEstimate = activeEmployees.reduce((acc, e) => acc + (Number(e.basic_salary) || 0) + (Number(e.allowance_transport) || 0) + (Number(e.allowance_meal) || 0) + (Number(e.allowance_position) || 0), 0);

  // Asset metrics
  const totalAssetsValue = assets.reduce((acc, a) => acc + (Number(a.purchase_price) || 0), 0);
  const totalAssetsBookValue = assets.reduce((acc, a) => acc + (Number(a.current_book_value) || 0), 0);
  const assetsInMaintenance = assets.filter(a => a.condition === 'Dalam Perbaikan' || a.condition === 'Rusak / Usang').length;

  // Recent 5 Invoices
  const recentInvoices = invoices.slice(0, 5);
  // Recent 5 Transactions
  const recentTransactions = transactions.slice(0, 5);

  return {
    metrics: {
      total_income: totalIncome,
      total_expense: totalExpense,
      net_profit: netProfit,
      unpaid_invoice_amount: unpaidInvoiceAmount,
      unpaid_invoice_count: unpaidInvoiceCount,
      active_employee_count: activeEmployees.length,
      monthly_salary_estimate: monthlySalaryEstimate,
      total_invoices: invoices.length,
      total_assets_count: assets.length,
      total_assets_value: totalAssetsValue,
      total_assets_book_value: totalAssetsBookValue,
      assets_in_maintenance: assetsInMaintenance
    },
    recent_invoices: recentInvoices,
    recent_transactions: recentTransactions,
    recent_assets: assets.slice(0, 4),
    company: db.company
  };
}

// Export / Import / Reset
function exportData() {
  return readDb();
}

function importData(payload) {
  if (!payload || !payload.company) throw new Error("Format data tidak valid.");
  writeDb(payload);
  return true;
}

function resetSampleData() {
  writeDb(defaultSampleData);
  return defaultSampleData;
}

// Authentication & User Management API
function authenticateUser(email, password) {
  const db = readDb();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const user = (db.users || []).find(u => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    throw new Error("Akun dengan email tersebut tidak ditemukan");
  }

  if (user.status !== 'Aktif') {
    throw new Error("Akun Anda telah dinonaktifkan. Hubungi administrator.");
  }

  if (!verifyPassword(password, user.password_hash)) {
    throw new Error("Kata sandi yang Anda masukkan salah");
  }

  // Generate session token
  const token = 'tok_' + user.id + '_' + crypto.randomBytes(24).toString('hex');
  db.sessions = db.sessions || {};
  db.sessions[token] = {
    user_id: user.id,
    created_at: Date.now()
  };

  user.last_login = new Date().toISOString();
  writeDb(db);

  const { password_hash, ...safeUser } = user;
  return { token, user: safeUser };
}

function getUserByToken(token) {
  if (!token) return null;
  const db = readDb();
  db.sessions = db.sessions || {};
  const sess = db.sessions[token];
  if (!sess) return null;

  // 14 days session expiry
  if (Date.now() - sess.created_at > 14 * 24 * 60 * 60 * 1000) {
    delete db.sessions[token];
    writeDb(db);
    return null;
  }

  const user = (db.users || []).find(u => u.id === sess.user_id);
  if (!user || user.status !== 'Aktif') return null;

  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function logoutUser(token) {
  if (!token) return true;
  const db = readDb();
  if (db.sessions && db.sessions[token]) {
    delete db.sessions[token];
    writeDb(db);
  }
  return true;
}

function getUsers() {
  const db = readDb();
  return (db.users || []).map(u => {
    const { password_hash, ...safe } = u;
    return safe;
  });
}

function getUserById(id) {
  const db = readDb();
  const user = (db.users || []).find(u => u.id === id);
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

function createUser(payload) {
  const db = readDb();
  db.users = db.users || [];

  const cleanEmail = String(payload.email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error("Email wajib diisi");

  const exists = db.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (exists) throw new Error("Email sudah digunakan oleh akun lain");

  const seq = String(db.users.length + 1).padStart(3, '0');
  const id = payload.id || `USR-${seq}`;
  const rawPassword = payload.password || 'password123';

  let empPosition = payload.position || 'Staff';
  if (payload.employee_id) {
    const emp = (db.employees || []).find(e => e.id === payload.employee_id);
    if (emp) empPosition = emp.position;
  }

  const newUser = {
    id,
    name: payload.name || 'Pengguna Baru',
    email: cleanEmail,
    password_hash: hashPassword(rawPassword),
    role: payload.role || 'STAFF', // SUPER_ADMIN, FINANCE, HR, STAFF
    employee_id: payload.employee_id || null,
    position: empPosition,
    status: payload.status || 'Aktif',
    created_at: new Date().toISOString(),
    last_login: null
  };

  db.users.push(newUser);
  writeDb(db);

  const { password_hash, ...safe } = newUser;
  return safe;
}

function updateUser(id, payload) {
  const db = readDb();
  db.users = db.users || [];
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return null;

  const prev = db.users[idx];

  // Prevent leaving zero SUPER_ADMIN
  if (prev.role === 'SUPER_ADMIN' && payload.role && payload.role !== 'SUPER_ADMIN') {
    const adminCount = db.users.filter(u => u.role === 'SUPER_ADMIN' && u.id !== id).length;
    if (adminCount === 0) {
      throw new Error("Tidak dapat mengubah peran admin terakhir sistem");
    }
  }

  let newPasswordHash = prev.password_hash;
  if (payload.password && payload.password.trim()) {
    newPasswordHash = hashPassword(payload.password.trim());
  }

  const updated = {
    ...prev,
    name: payload.name !== undefined ? payload.name.trim() : prev.name,
    email: payload.email !== undefined ? payload.email.trim().toLowerCase() : prev.email,
    role: payload.role !== undefined ? payload.role : prev.role,
    employee_id: payload.employee_id !== undefined ? payload.employee_id : prev.employee_id,
    position: payload.position !== undefined ? payload.position : prev.position,
    status: payload.status !== undefined ? payload.status : prev.status,
    password_hash: newPasswordHash
  };

  db.users[idx] = updated;
  writeDb(db);

  const { password_hash, ...safe } = updated;
  return safe;
}

function deleteUser(id) {
  const db = readDb();
  db.users = db.users || [];
  const user = db.users.find(u => u.id === id);
  if (!user) return false;

  if (user.role === 'SUPER_ADMIN') {
    const adminCount = db.users.filter(u => u.role === 'SUPER_ADMIN').length;
    if (adminCount <= 1) {
      throw new Error("Tidak dapat menghapus Super Admin utama sistem");
    }
  }

  db.users = db.users.filter(u => u.id !== id);
  writeDb(db);
  return true;
}

module.exports = {
  getCompany,
  updateCompany,
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getTransactions,
  createTransaction,
  deleteTransaction,
  getAccountingReport,
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getPayrolls,
  getPayrollById,
  createPayroll,
  updatePayroll,
  generateBatchPayroll,
  deletePayroll,
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  authenticateUser,
  getUserByToken,
  logoutUser,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getDashboardSummary,
  exportData,
  importData,
  resetSampleData
};
