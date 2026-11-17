const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
require('dotenv').config();

// PostgreSQL Connection Pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'company_mgmt',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password), hash);
}

// Helper: run query with params
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  // console.log('QUERY', { text: text.substring(0, 100), duration: Date.now() - start, rows: res.rowCount });
  return res;
}

// Helper: get single row
async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

// Helper: get multiple rows
async function queryAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

// ==================== COMPANY ====================
async function getCompany() {
  return queryOne('SELECT * FROM companies ORDER BY id LIMIT 1');
}

async function updateCompany(patch) {
  const fields = Object.keys(patch).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return getCompany();

  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = [Date.now(), ...fields.map(f => patch[f])];
  
  await query(
    `UPDATE companies SET ${setClause}, updated_at = NOW() WHERE id = $1`,
    values
  );
  return getCompany();
}

// ==================== USERS / AUTH ====================
async function authenticateUser(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const user = await queryOne(
    'SELECT * FROM users WHERE lower(email) = $1',
    [cleanEmail]
  );

  if (!user) throw new Error('Akun dengan email tersebut tidak ditemukan');
  if (user.status !== 'Aktif') throw new Error('Akun Anda telah dinonaktifkan. Hubungi administrator.');
  if (!verifyPassword(password, user.password_hash)) throw new Error('Kata sandi yang Anda masukkan salah');

  // Generate session token
  const token = 'tok_' + user.id + '_' + crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 days

  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, user.id, Date.now(), expiresAt]
  );

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const { password_hash, ...safeUser } = user;
  return { token, user: safeUser };
}

async function getUserByToken(token) {
  if (!token) return null;
  
  const session = await queryOne(
    `SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = $1`,
    [token]
  );

  if (!session) return null;
  if (Date.now() > session.expires_at) {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }
  if (session.status !== 'Aktif') return null;

  const { password_hash, ...safeUser } = session;
  return safeUser;
}

async function logoutUser(token) {
  if (!token) return true;
  await query('DELETE FROM sessions WHERE token = $1', [token]);
  return true;
}

async function getUsers() {
  const rows = await queryAll('SELECT id, name, email, role, employee_id, position, status, created_at, last_login FROM users ORDER BY created_at');
  return rows;
}

async function getUserById(id) {
  return queryOne('SELECT id, name, email, role, employee_id, position, status, created_at, last_login FROM users WHERE id = $1', [id]);
}

async function createUser(payload) {
  const cleanEmail = String(payload.email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('Email wajib diisi');

  const exists = await queryOne('SELECT 1 FROM users WHERE lower(email) = $1', [cleanEmail]);
  if (exists) throw new Error('Email sudah digunakan oleh akun lain');

  const seq = String((await queryOne('SELECT COUNT(*)::int FROM users')).count + 1).padStart(3, '0');
  const id = payload.id || `USR-${seq}`;
  const rawPassword = payload.password || 'password123';

  let empPosition = payload.position || 'Staff';
  if (payload.employee_id) {
    const emp = await queryOne('SELECT position FROM employees WHERE id = $1', [payload.employee_id]);
    if (emp) empPosition = emp.position;
  }

  const newUser = {
    id,
    name: payload.name || 'Pengguna Baru',
    email: cleanEmail,
    password_hash: hashPassword(rawPassword),
    role: payload.role || 'STAFF',
    employee_id: payload.employee_id || null,
    position: empPosition,
    status: payload.status || 'Aktif',
  };

  await query(
    `INSERT INTO users (id, name, email, password_hash, role, employee_id, position, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [newUser.id, newUser.name, newUser.email, newUser.password_hash, newUser.role, newUser.employee_id, newUser.position, newUser.status]
  );

  const { password_hash, ...safe } = newUser;
  return safe;
}

async function updateUser(id, payload) {
  const prev = await queryOne('SELECT * FROM users WHERE id = $1', [id]);
  if (!prev) return null;

  if (prev.role === 'SUPER_ADMIN' && payload.role && payload.role !== 'SUPER_ADMIN') {
    const adminCount = (await queryOne('SELECT COUNT(*)::int FROM users WHERE role = $1 AND id != $2', ['SUPER_ADMIN', id])).count;
    if (adminCount === 0) throw new Error('Tidak dapat mengubah peran admin terakhir sistem');
  }

  let newPasswordHash = prev.password_hash;
  if (payload.password && payload.password.trim()) {
    newPasswordHash = hashPassword(payload.password.trim());
  }

  const fields = [];
  const values = [];
  let paramIndex = 1;

  const allowedFields = ['name', 'email', 'role', 'employee_id', 'position', 'status'];
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(field === 'email' ? payload[field].trim().toLowerCase() : (field === 'name' ? payload[field].trim() : payload[field]));
      paramIndex++;
    }
  }

  fields.push(`password_hash = $${paramIndex}`);
  values.push(newPasswordHash);
  paramIndex++;

  values.push(id);

  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
  return getUserById(id);
}

async function deleteUser(id) {
  const user = await queryOne('SELECT role FROM users WHERE id = $1', [id]);
  if (!user) return false;

  if (user.role === 'SUPER_ADMIN') {
    const adminCount = (await queryOne('SELECT COUNT(*)::int FROM users WHERE role = $1', ['SUPER_ADMIN'])).count;
    if (adminCount <= 1) throw new Error('Tidak dapat menghapus Super Admin utama sistem');
  }

  await query('DELETE FROM users WHERE id = $1', [id]);
  return true;
}

// ==================== EMPLOYEES ====================
async function getEmployees() {
  return queryAll('SELECT * FROM employees ORDER BY name');
}

async function getEmployeeById(id) {
  return queryOne('SELECT * FROM employees WHERE id = $1', [id]);
}

async function createEmployee(payload) {
  const seq = String((await queryOne('SELECT COUNT(*)::int FROM employees')).count + 1).padStart(3, '0');
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
    bpjs_ketenagakerjaan: Number(payload.bpjs_ketenagakerjaan) || 0,
  };

  await query(
    `INSERT INTO employees (id, name, email, phone, position, department, employment_type, join_date, status, bank_name, bank_account, basic_salary, allowance_transport, allowance_meal, allowance_position, bpjs_kesehatan, bpjs_ketenagakerjaan, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())`,
    [newEmp.id, newEmp.name, newEmp.email, newEmp.phone, newEmp.position, newEmp.department, newEmp.employment_type, newEmp.join_date, newEmp.status, newEmp.bank_name, newEmp.bank_account, newEmp.basic_salary, newEmp.allowance_transport, newEmp.allowance_meal, newEmp.allowance_position, newEmp.bpjs_kesehatan, newEmp.bpjs_ketenagakerjaan]
  );

  return newEmp;
}

async function updateEmployee(id, payload) {
  const prev = await queryOne('SELECT * FROM employees WHERE id = $1', [id]);
  if (!prev) return null;

  const fields = [];
  const values = [];
  let paramIndex = 1;

  const allowedFields = ['name', 'email', 'phone', 'position', 'department', 'employment_type', 'join_date', 'status', 'bank_name', 'bank_account'];
  const numericFields = ['basic_salary', 'allowance_transport', 'allowance_meal', 'allowance_position', 'bpjs_kesehatan', 'bpjs_ketenagakerjaan'];

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(payload[field]);
      paramIndex++;
    }
  }

  for (const field of numericFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(Number(payload[field]) || 0);
      paramIndex++;
    }
  }

  if (fields.length === 0) return prev;

  fields.push(`updated_at = NOW()`);
  values.push(id);

  await query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
  return getEmployeeById(id);
}

async function deleteEmployee(id) {
  const result = await query('DELETE FROM employees WHERE id = $1', [id]);
  return result.rowCount > 0;
}

// ==================== INVOICES ====================
async function getInvoices() {
  return queryAll('SELECT * FROM invoices ORDER BY created_at DESC');
}

async function getInvoiceById(id) {
  return queryOne('SELECT * FROM invoices WHERE id = $1', [id]);
}

async function createInvoice(payload) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String((await queryOne('SELECT COUNT(*)::int FROM invoices')).count + 1).padStart(3, '0');
  const invoiceNumber = payload.invoice_number || `INV/${yearMonth}/${seq}`;
  const id = `INV-${yearMonth}-${seq}-${crypto.randomBytes(2).toString('hex')}`;

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
  const taxRate = payload.tax_rate !== undefined ? Number(payload.tax_rate) : 11;
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
    client_name: payload.client?.name || 'Nama Pelanggan',
    client_attn: payload.client?.attn || '',
    client_email: payload.client?.email || '',
    client_phone: payload.client?.phone || '',
    client_address: payload.client?.address || '',
    items: JSON.stringify(items),
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    grand_total: grandTotal,
    notes: payload.notes || 'Terima kasih atas kerja samanya.',
    payment_date: payload.status === 'Lunas' ? (payload.payment_date || now.toISOString().split('T')[0]) : null,
    payment_method: payload.status === 'Lunas' ? (payload.payment_method || 'Transfer Bank') : null,
  };

  await query(
    `INSERT INTO invoices (id, invoice_number, date, due_date, status, client_name, client_attn, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, discount_amount, grand_total, notes, payment_date, payment_method, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())`,
    [newInvoice.id, newInvoice.invoice_number, newInvoice.date, newInvoice.due_date, newInvoice.status, newInvoice.client_name, newInvoice.client_attn, newInvoice.client_email, newInvoice.client_phone, newInvoice.client_address, newInvoice.items, newInvoice.subtotal, newInvoice.tax_rate, newInvoice.tax_amount, newInvoice.discount_amount, newInvoice.grand_total, newInvoice.notes, newInvoice.payment_date, newInvoice.payment_method]
  );

  if (newInvoice.status === 'Lunas') {
    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [`TRX-${Date.now()}`, newInvoice.payment_date, 'Pemasukan', 'Pembayaran Faktur', newInvoice.grand_total, `Pelunasan Faktur ${newInvoice.invoice_number} - ${newInvoice.client_name}`, newInvoice.payment_method || 'Transfer Bank', newInvoice.invoice_number]
    );
  }

  return newInvoice;
}

async function updateInvoice(id, payload) {
  const prev = await queryOne('SELECT * FROM invoices WHERE id = $1', [id]);
  if (!prev) return null;

  const items = (payload.items || JSON.parse(prev.items) || []).map((it, i) => {
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

  const fields = [
    'invoice_number = $2', 'date = $3', 'due_date = $4', 'status = $5',
    'client_name = $6', 'client_attn = $7', 'client_email = $8', 'client_phone = $9', 'client_address = $10',
    'items = $11', 'subtotal = $12', 'tax_rate = $13', 'tax_amount = $14', 'discount_amount = $15', 'grand_total = $16',
    'notes = $17', 'updated_at = NOW()'
  ];
  const values = [
    id, payload.invoice_number || prev.invoice_number, payload.date || prev.date, payload.due_date || prev.due_date, payload.status || prev.status,
    payload.client?.name || prev.client_name, payload.client?.attn || prev.client_attn, payload.client?.email || prev.client_email, payload.client?.phone || prev.client_phone, payload.client?.address || prev.client_address,
    JSON.stringify(items), subtotal, taxRate, taxAmount, discountAmount, grandTotal,
    payload.notes !== undefined ? payload.notes : prev.notes
  ];

  if (!wasPaid && isPaid) {
    const now = new Date();
    const paymentDate = payload.payment_date || now.toISOString().split('T')[0];
    const paymentMethod = payload.payment_method || 'Transfer Bank';
    fields.push('payment_date = $' + (values.length + 1), 'payment_method = $' + (values.length + 2));
    values.push(paymentDate, paymentMethod);

    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [`TRX-${Date.now()}`, paymentDate, 'Pemasukan', 'Pembayaran Faktur', grandTotal, `Pelunasan Faktur ${prev.invoice_number} - ${prev.client_name}`, paymentMethod, prev.invoice_number]
    );
  }

  await query(`UPDATE invoices SET ${fields.join(', ')} WHERE id = $1`, values);
  return getInvoiceById(id);
}

async function deleteInvoice(id) {
  const result = await query('DELETE FROM invoices WHERE id = $1', [id]);
  return result.rowCount > 0;
}

// ==================== TRANSACTIONS ====================
async function getTransactions(filters = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.type && filters.type !== 'Semua') {
    where += ` AND type = $${paramIndex}`;
    params.push(filters.type);
    paramIndex++;
  }
  if (filters.category && filters.category !== 'Semua') {
    where += ` AND category = $${paramIndex}`;
    params.push(filters.category);
    paramIndex++;
  }
  if (filters.startDate) {
    where += ` AND date >= $${paramIndex}`;
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    where += ` AND date <= $${paramIndex}`;
    params.push(filters.endDate);
    paramIndex++;
  }

  return queryAll(`SELECT * FROM transactions ${where} ORDER BY date DESC, created_at DESC`, params);
}

async function createTransaction(payload) {
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
  };

  await query(
    `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [newTx.id, newTx.date, newTx.type, newTx.category, newTx.amount, newTx.description, newTx.payment_method, newTx.reference]
  );

  return newTx;
}

async function deleteTransaction(id) {
  const result = await query('DELETE FROM transactions WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function getAccountingReport(periodFilter) {
  const rows = await queryAll('SELECT type, category, amount FROM transactions');
  
  let totalIncome = 0;
  let totalExpense = 0;
  const incomeCategories = {};
  const expenseCategories = {};

  rows.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'Pemasukan') {
      totalIncome += amt;
      incomeCategories[t.category] = (incomeCategories[t.category] || 0) + amt;
    } else {
      totalExpense += amt;
      expenseCategories[t.category] = (expenseCategories[t.category] || 0) + amt;
    }
  });

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    net_profit: totalIncome - totalExpense,
    income_categories: incomeCategories,
    expense_categories: expenseCategories,
    transaction_count: rows.length
  };
}

// ==================== PAYROLL ====================
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

async function getPayrolls(period) {
  let where = '';
  const params = [];
  if (period) {
    where = 'WHERE period = $1';
    params.push(period);
  }
  return queryAll(`SELECT * FROM payrolls ${where} ORDER BY created_at DESC`, params);
}

async function getPayrollById(id) {
  return queryOne('SELECT * FROM payrolls WHERE id = $1', [id]);
}

async function createPayroll(payload) {
  const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [payload.employee_id]);
  if (!emp) throw new Error('Karyawan tidak ditemukan');

  const calc = calculatePayrollValues(emp, payload.bonus, payload.overtime, payload.deduction_other);

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
  };

  await query(
    `INSERT INTO payrolls (id, period, period_label, employee_id, employee_name, employee_position, employee_department, basic_salary, allowance_transport, allowance_meal, allowance_position, total_allowance, bonus, overtime, gross_salary, deduction_bpjs_ks, deduction_bpjs_tk, deduction_pph21, deduction_other, total_deduction, net_salary, status, payment_date, payment_method, notes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())`,
    [newPayroll.id, newPayroll.period, newPayroll.period_label, newPayroll.employee_id, newPayroll.employee_name, newPayroll.employee_position, newPayroll.employee_department, newPayroll.basic_salary, newPayroll.allowance_transport, newPayroll.allowance_meal, newPayroll.allowance_position, newPayroll.total_allowance, newPayroll.bonus, newPayroll.overtime, newPayroll.gross_salary, newPayroll.deduction_bpjs_ks, newPayroll.deduction_bpjs_tk, newPayroll.deduction_pph21, newPayroll.deduction_other, newPayroll.total_deduction, newPayroll.net_salary, newPayroll.status, newPayroll.payment_date, newPayroll.payment_method, newPayroll.notes]
  );

  if (newPayroll.status === 'Dibayar') {
    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [`TRX-${Date.now()}`, newPayroll.payment_date, 'Pengeluaran', 'Beban Gaji Karyawan', newPayroll.net_salary, `Gaji ${newPayroll.period_label} - ${newPayroll.employee_name} (${newPayroll.employee_id})`, newPayroll.payment_method, newPayroll.id]
    );
  }

  return newPayroll;
}

async function updatePayroll(id, payload) {
  const prev = await queryOne('SELECT * FROM payrolls WHERE id = $1', [id]);
  if (!prev) return null;

  const wasPaid = prev.status === 'Dibayar';
  const isPaid = payload.status === 'Dibayar';

  const fields = [];
  const values = [id];
  let paramIndex = 2;

  const allowedFields = ['period', 'period_label', 'employee_id', 'employee_name', 'employee_position', 'employee_department', 'basic_salary', 'allowance_transport', 'allowance_meal', 'allowance_position', 'total_allowance', 'bonus', 'overtime', 'gross_salary', 'deduction_bpjs_ks', 'deduction_bpjs_tk', 'deduction_pph21', 'deduction_other', 'total_deduction', 'net_salary', 'status', 'payment_date', 'payment_method', 'notes'];

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(payload[field]);
      paramIndex++;
    }
  }

  if (fields.length === 0) return prev;

  fields.push(`updated_at = NOW()`);

  if (!wasPaid && isPaid) {
    const now = new Date();
    const paymentDate = payload.payment_date || now.toISOString().split('T')[0];
    fields.push(`payment_date = $${paramIndex}`);
    values.push(paymentDate);
    paramIndex++;

    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [`TRX-${Date.now()}`, paymentDate, 'Pengeluaran', 'Beban Gaji Karyawan', prev.net_salary, `Gaji ${prev.period_label} - ${prev.employee_name} (${prev.employee_id})`, prev.payment_method, prev.id]
    );
  }

  await query(`UPDATE payrolls SET ${fields.join(', ')} WHERE id = $1`, values);
  return getPayrollById(id);
}

async function generateBatchPayroll(period) {
  const activeEmployees = await queryAll("SELECT * FROM employees WHERE status = 'Aktif'");

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const [pYear, pMonth] = period.split('-');
  const periodLabel = `${monthNames[parseInt(pMonth, 10) - 1]} ${pYear}`;
  const now = new Date();

  const generated = [];

  for (const emp of activeEmployees) {
    const exists = await queryOne('SELECT 1 FROM payrolls WHERE period = $1 AND employee_id = $2', [period, emp.id]);
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
        status: 'Siap Bayar',
        payment_date: null,
        payment_method: `Transfer ${emp.bank_name} (${emp.bank_account})`,
        notes: `Generate otomatis periode ${periodLabel}`,
      };

      await query(
        `INSERT INTO payrolls (id, period, period_label, employee_id, employee_name, employee_position, employee_department, basic_salary, allowance_transport, allowance_meal, allowance_position, total_allowance, bonus, overtime, gross_salary, deduction_bpjs_ks, deduction_bpjs_tk, deduction_pph21, deduction_other, total_deduction, net_salary, status, payment_date, payment_method, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())`,
        [item.id, item.period, item.period_label, item.employee_id, item.employee_name, item.employee_position, item.employee_department, item.basic_salary, item.allowance_transport, item.allowance_meal, item.allowance_position, item.total_allowance, item.bonus, item.overtime, item.gross_salary, item.deduction_bpjs_ks, item.deduction_bpjs_tk, item.deduction_pph21, item.deduction_other, item.total_deduction, item.net_salary, item.status, item.payment_date, item.payment_method, item.notes]
      );

      generated.push(item);
    }
  }

  return {
    generated_count: generated.length,
    payrolls: generated
  };
}

async function deletePayroll(id) {
  const result = await query('DELETE FROM payrolls WHERE id = $1', [id]);
  return result.rowCount > 0;
}

// ==================== ASSETS ====================
function calculateAssetDepreciation(asset) {
  const purchasePrice = Number(asset.purchase_price) || 0;
  const salvageValue = Number(asset.salvage_value) || 0;
  const usefulLifeYears = Number(asset.useful_life_years) || 4;
  const totalUsefulMonths = Math.max(1, usefulLifeYears * 12);

  const purchaseDate = new Date(asset.purchase_date || Date.now());
  const now = new Date();
  
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

async function getAssets(filters = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.category && filters.category !== 'Semua') {
    where += ` AND category = $${paramIndex}`;
    params.push(filters.category);
    paramIndex++;
  }
  if (filters.condition && filters.condition !== 'Semua') {
    where += ` AND condition = $${paramIndex}`;
    params.push(filters.condition);
    paramIndex++;
  }
  if (filters.search) {
    where += ` AND (name ILIKE $${paramIndex} OR id ILIKE $${paramIndex} OR serial_number ILIKE $${paramIndex} OR assigned_to_name ILIKE $${paramIndex} OR location ILIKE $${paramIndex})`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const rows = await queryAll(`SELECT * FROM assets ${where} ORDER BY created_at DESC`, params);
  return rows.map(calculateAssetDepreciation);
}

async function getAssetById(id) {
  const found = await queryOne('SELECT * FROM assets WHERE id = $1', [id]);
  return found ? calculateAssetDepreciation(found) : null;
}

async function createAsset(payload) {
  const now = new Date();
  const seq = String((await queryOne('SELECT COUNT(*)::int FROM assets')).count + 1).padStart(3, '0');
  
  let catPrefix = 'AST';
  if (payload.category === 'Elektronik & Komputer') catPrefix = 'AST-IT';
  else if (payload.category === 'Kendaraan Operasional') catPrefix = 'AST-VEH';
  else if (payload.category === 'Furnitur & Peralatan Kantor') catPrefix = 'AST-OFF';
  else if (payload.category === 'Mesin & Infrastruktur') catPrefix = 'AST-EQP';
  
  const id = payload.id || `${catPrefix}-${seq}`;

  let assignedName = payload.assigned_to_name || '-';
  if (payload.assigned_to_id) {
    const emp = await queryOne('SELECT name FROM employees WHERE id = $1', [payload.assigned_to_id]);
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
    condition: payload.condition || 'Baik',
    serial_number: payload.serial_number || '-',
    vendor: payload.vendor || '-',
    notes: payload.notes || '',
  };

  await query(
    `INSERT INTO assets (id, name, category, purchase_date, purchase_price, useful_life_years, salvage_value, assigned_to_id, assigned_to_name, location, condition, serial_number, vendor, notes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
    [newAsset.id, newAsset.name, newAsset.category, newAsset.purchase_date, newAsset.purchase_price, newAsset.useful_life_years, newAsset.salvage_value, newAsset.assigned_to_id, newAsset.assigned_to_name, newAsset.location, newAsset.condition, newAsset.serial_number, newAsset.vendor, newAsset.notes]
  );

  if (payload.record_expense && newAsset.purchase_price > 0) {
    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [`TRX-${Date.now()}`, newAsset.purchase_date, 'Pengeluaran', 'Peralatan & Perlengkapan Kantor', newAsset.purchase_price, `Pengadaan Aset (${newAsset.id}): ${newAsset.name}`, payload.payment_method || 'Transfer Bank BCA', newAsset.id]
    );
  }

  return calculateAssetDepreciation(newAsset);
}

async function updateAsset(id, payload) {
  const prev = await queryOne('SELECT * FROM assets WHERE id = $1', [id]);
  if (!prev) return null;

  let assignedName = payload.assigned_to_name || prev.assigned_to_name;
  if (payload.assigned_to_id && payload.assigned_to_id !== prev.assigned_to_id) {
    const emp = await queryOne('SELECT name FROM employees WHERE id = $1', [payload.assigned_to_id]);
    if (emp) assignedName = emp.name;
  }

  const fields = [];
  const values = [id];
  let paramIndex = 2;

  const allowedFields = ['name', 'category', 'purchase_date', 'useful_life_years', 'salvage_value', 'assigned_to_id', 'assigned_to_name', 'location', 'condition', 'serial_number', 'vendor', 'notes'];
  const numericFields = ['purchase_price', 'useful_life_years', 'salvage_value'];

  for (const field of allowedFields) {
    if (payload[field] !== undefined && !numericFields.includes(field)) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(payload[field]);
      paramIndex++;
    }
  }
  for (const field of numericFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(Number(payload[field]));
      paramIndex++;
    }
  }

  if (payload.assigned_to_id !== undefined) {
    fields.push(`assigned_to_name = $${paramIndex}`);
    values.push(assignedName);
    paramIndex++;
  }

  if (fields.length === 0) return calculateAssetDepreciation(prev);

  fields.push(`updated_at = NOW()`);

  await query(`UPDATE assets SET ${fields.join(', ')} WHERE id = $1`, values);
  return getAssetById(id);
}

async function deleteAsset(id) {
  const result = await query('DELETE FROM assets WHERE id = $1', [id]);
  return result.rowCount > 0;
}

// ==================== DASHBOARD ====================
async function getDashboardSummary() {
  const company = await getCompany();
  
  const [invoices, transactions, employees, payrolls, assets] = await Promise.all([
    queryAll('SELECT * FROM invoices'),
    queryAll('SELECT * FROM transactions'),
    queryAll("SELECT * FROM employees WHERE status = 'Aktif'"),
    queryAll('SELECT * FROM payrolls'),
    queryAll('SELECT * FROM assets'),
  ]);

  // Invoice metrics
  let totalInvoiced = 0;
  let unpaidInvoiceAmount = 0;
  let unpaidInvoiceCount = 0;
  invoices.forEach(inv => {
    totalInvoiced += Number(inv.grand_total) || 0;
    if (inv.status === 'Terkirim' || inv.status === 'Jatuh Tempo') {
      unpaidInvoiceAmount += Number(inv.grand_total) || 0;
      unpaidInvoiceCount += 1;
    }
  });

  // Transaction metrics
  let totalIncome = 0;
  let totalExpense = 0;
  transactions.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'Pemasukan') totalIncome += amt;
    else totalExpense += amt;
  });

  const netProfit = totalIncome - totalExpense;

  // Employee metrics
  const activeEmployees = employees;
  const monthlySalaryEstimate = activeEmployees.reduce((acc, e) => acc + (Number(e.basic_salary) || 0) + (Number(e.allowance_transport) || 0) + (Number(e.allowance_meal) || 0) + (Number(e.allowance_position) || 0), 0);

  // Asset metrics with depreciation
  const assetsWithDep = assets.map(calculateAssetDepreciation);
  const totalAssetsValue = assetsWithDep.reduce((acc, a) => acc + (Number(a.purchase_price) || 0), 0);
  const totalAssetsBookValue = assetsWithDep.reduce((acc, a) => acc + (Number(a.current_book_value) || 0), 0);
  const assetsInMaintenance = assetsWithDep.filter(a => a.condition === 'Dalam Perbaikan' || a.condition === 'Rusak / Usang').length;

  // Recent data
  const recentInvoices = invoices.slice(0, 5);
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
    recent_assets: assetsWithDep.slice(0, 4),
    company
  };
}

// ==================== EXPORT/IMPORT/RESET ====================
async function exportData() {
  const [company, employees, invoices, transactions, payrolls, assets, users] = await Promise.all([
    getCompany(),
    getEmployees(),
    getInvoices(),
    getTransactions(),
    getPayrolls(),
    getAssets(),
    getUsers(),
  ]);
  return { company, employees, invoices, transactions, payrolls, assets, users, sessions: {} };
}

async function importData(payload) {
  if (!payload || !payload.company) throw new Error('Format data tidak valid.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data (in correct order due to FK constraints)
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM payrolls');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM assets');
    await client.query('DELETE FROM employees');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM companies');

    // Insert company
    const c = payload.company;
    await client.query(
      `INSERT INTO companies (name, tagline, address, phone, email, website, npwp, bank_name, bank_account_number, bank_account_holder, currency, currency_symbol, tax_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [c.name, c.tagline, c.address, c.phone, c.email, c.website, c.npwp, c.bank_name, c.bank_account_number, c.bank_account_holder, c.currency, c.currency_symbol, c.tax_rate]
    );

    // Insert users
    if (payload.users?.length) {
      for (const u of payload.users) {
        await client.query(
          `INSERT INTO users (id, name, email, password_hash, role, employee_id, position, status, created_at, last_login)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [u.id, u.name, u.email, u.password_hash, u.role, u.employee_id, u.position, u.status, u.created_at, u.last_login]
        );
      }
    }

    // Insert employees
    if (payload.employees?.length) {
      for (const e of payload.employees) {
        await client.query(
          `INSERT INTO employees (id, name, email, phone, position, department, employment_type, join_date, status, bank_name, bank_account, basic_salary, allowance_transport, allowance_meal, allowance_position, bpjs_kesehatan, bpjs_ketenagakerjaan, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [e.id, e.name, e.email, e.phone, e.position, e.department, e.employment_type, e.join_date, e.status, e.bank_name, e.bank_account, e.basic_salary, e.allowance_transport, e.allowance_meal, e.allowance_position, e.bpjs_kesehatan, e.bpjs_ketenagakerjaan, e.created_at, e.updated_at || e.created_at]
        );
      }
    }

    // Insert invoices
    if (payload.invoices?.length) {
      for (const inv of payload.invoices) {
        await client.query(
          `INSERT INTO invoices (id, invoice_number, date, due_date, status, client_name, client_attn, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, discount_amount, grand_total, notes, payment_date, payment_method, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [inv.id, inv.invoice_number, inv.date, inv.due_date, inv.status, inv.client_name, inv.client_attn, inv.client_email, inv.client_phone, inv.client_address, JSON.stringify(inv.items), inv.subtotal, inv.tax_rate, inv.tax_amount, inv.discount_amount, inv.grand_total, inv.notes, inv.payment_date, inv.payment_method, inv.created_at, inv.updated_at || inv.created_at]
        );
      }
    }

    // Insert transactions
    if (payload.transactions?.length) {
      for (const t of payload.transactions) {
        await client.query(
          `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [t.id, t.date, t.type, t.category, t.amount, t.description, t.payment_method, t.reference, t.created_at]
        );
      }
    }

    // Insert payrolls
    if (payload.payrolls?.length) {
      for (const p of payload.payrolls) {
        await client.query(
          `INSERT INTO payrolls (id, period, period_label, employee_id, employee_name, employee_position, employee_department, basic_salary, allowance_transport, allowance_meal, allowance_position, total_allowance, bonus, overtime, gross_salary, deduction_bpjs_ks, deduction_bpjs_tk, deduction_pph21, deduction_other, total_deduction, net_salary, status, payment_date, payment_method, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
          [p.id, p.period, p.period_label, p.employee_id, p.employee_name, p.employee_position, p.employee_department, p.basic_salary, p.allowance_transport, p.allowance_meal, p.allowance_position, p.total_allowance, p.bonus, p.overtime, p.gross_salary, p.deduction_bpjs_ks, p.deduction_bpjs_tk, p.deduction_pph21, p.deduction_other, p.total_deduction, p.net_salary, p.status, p.payment_date, p.payment_method, p.notes, p.created_at, p.updated_at || p.created_at]
        );
      }
    }

    // Insert assets
    if (payload.assets?.length) {
      for (const a of payload.assets) {
        await client.query(
          `INSERT INTO assets (id, name, category, purchase_date, purchase_price, useful_life_years, salvage_value, assigned_to_id, assigned_to_name, location, condition, serial_number, vendor, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [a.id, a.name, a.category, a.purchase_date, a.purchase_price, a.useful_life_years, a.salvage_value, a.assigned_to_id, a.assigned_to_name, a.location, a.condition, a.serial_number, a.vendor, a.notes, a.created_at, a.updated_at || a.created_at]
        );
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function resetSampleData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM payrolls');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM assets');
    await client.query('DELETE FROM employees');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM companies');

    // Re-insert default company
    await client.query(
      `INSERT INTO companies (name, tagline, address, phone, email, website, npwp, bank_name, bank_account_number, bank_account_holder, currency, currency_symbol, tax_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      ['PT Sinar Digital Nusantara', 'Solusi Teknologi & Layanan Manajemen Bisnis', 'Gedung Cyber 2 Lantai 12, Jl. H.R. Rasuna Said Blok X-5, Kuningan, Jakarta Selatan 12950', '+62 21 555-0899', 'finance@sinardigital.co.id', 'https://sinardigital.co.id', '01.345.678.9-012.000', 'Bank Central Asia (BCA)', '8801-9234-5561', 'PT SINAR DIGITAL NUSANTARA', 'IDR', 'Rp', 11]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Graceful shutdown
async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  queryOne,
  queryAll,
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
  resetSampleData,
  closePool,
  hashPassword,
  verifyPassword,
  calculatePayrollValues,
  calculateAssetDepreciation
};