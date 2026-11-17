const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

// PostgreSQL Connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'company_mgmt',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting migration from JSON to PostgreSQL...');
    
    // Read JSON database
    const dbPath = path.join(__dirname, '..', 'data', 'database.json');
    if (!fs.existsSync(dbPath)) {
      console.log('❌ JSON database not found at:', dbPath);
      return;
    }
    
    const jsonData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    console.log('📄 Loaded JSON database');
    
    await client.query('BEGIN');
    
    // Clear existing data (respect FK constraints)
    console.log('🧹 Clearing existing data...');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM payrolls');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM assets');
    await client.query('DELETE FROM employees');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM companies');
    
    // 1. Insert Company
    if (jsonData.company) {
      const c = jsonData.company;
      console.log('🏢 Inserting company...');
      await client.query(
        `INSERT INTO companies (name, tagline, address, phone, email, website, npwp, bank_name, bank_account_number, bank_account_holder, currency, currency_symbol, tax_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [c.name, c.tagline, c.address, c.phone, c.email, c.website, c.npwp, c.bank_name, c.bank_account_number, c.bank_account_holder, c.currency, c.currency_symbol, c.tax_rate]
      );
    }
    
    // 2. Insert Users (passwords need re-hashing with bcrypt)
    if (jsonData.users?.length) {
      console.log(`👥 Inserting ${jsonData.users.length} users...`);
      for (const u of jsonData.users) {
        // Passwords in JSON are SHA256, we need to set a default bcrypt password
        // In production, users would need to reset passwords
        const passwordHash = u.password_hash.startsWith('$2b$') 
          ? u.password_hash 
          : hashPassword('password123'); // Default fallback
        
        await client.query(
          `INSERT INTO users (id, name, email, password_hash, role, employee_id, position, status, created_at, last_login)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [u.id, u.name, u.email, passwordHash, u.role, u.employee_id, u.position, u.status, u.created_at, u.last_login]
        );
      }
    }
    
    // 3. Insert Employees
    if (jsonData.employees?.length) {
      console.log(`👨‍💼 Inserting ${jsonData.employees.length} employees...`);
      for (const e of jsonData.employees) {
        await client.query(
          `INSERT INTO employees (id, name, email, phone, position, department, employment_type, join_date, status, bank_name, bank_account, basic_salary, allowance_transport, allowance_meal, allowance_position, bpjs_kesehatan, bpjs_ketenagakerjaan, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [e.id, e.name, e.email, e.phone, e.position, e.department, e.employment_type, e.join_date, e.status, e.bank_name, e.bank_account, e.basic_salary, e.allowance_transport, e.allowance_meal, e.allowance_position, e.bpjs_kesehatan, e.bpjs_ketenagakerjaan, e.created_at, new Date().toISOString()]
        );
      }
    }
    
    // 4. Insert Invoices
    if (jsonData.invoices?.length) {
      console.log(`📄 Inserting ${jsonData.invoices.length} invoices...`);
      for (const inv of jsonData.invoices) {
        await client.query(
          `INSERT INTO invoices (id, invoice_number, date, due_date, status, client_name, client_attn, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, discount_amount, grand_total, notes, payment_date, payment_method, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [inv.id, inv.invoice_number, inv.date, inv.due_date, inv.status, inv.client?.name || '', inv.client?.attn || '', inv.client?.email || '', inv.client?.phone || '', inv.client?.address || '', JSON.stringify(inv.items || []), inv.subtotal, inv.tax_rate, inv.tax_amount, inv.discount_amount, inv.grand_total, inv.notes, inv.payment_date, inv.payment_method, inv.created_at, new Date().toISOString()]
        );
      }
    }
    
    // 5. Insert Transactions
    if (jsonData.transactions?.length) {
      console.log(`💰 Inserting ${jsonData.transactions.length} transactions...`);
      for (const t of jsonData.transactions) {
        await client.query(
          `INSERT INTO transactions (id, date, type, category, amount, description, payment_method, reference, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [t.id, t.date, t.type, t.category, t.amount, t.description, t.payment_method, t.reference, t.created_at]
        );
      }
    }
    
    // 6. Insert Payrolls
    if (jsonData.payrolls?.length) {
      console.log(`💵 Inserting ${jsonData.payrolls.length} payrolls...`);
      for (const p of jsonData.payrolls) {
        await client.query(
          `INSERT INTO payrolls (id, period, period_label, employee_id, employee_name, employee_position, employee_department, basic_salary, allowance_transport, allowance_meal, allowance_position, total_allowance, bonus, overtime, gross_salary, deduction_bpjs_ks, deduction_bpjs_tk, deduction_pph21, deduction_other, total_deduction, net_salary, status, payment_date, payment_method, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
          [p.id, p.period, p.period_label, p.employee_id, p.employee_name, p.employee_position, p.employee_department, p.basic_salary, p.allowance_transport, p.allowance_meal, p.allowance_position, p.total_allowance, p.bonus, p.overtime, p.gross_salary, p.deduction_bpjs_ks, p.deduction_bpjs_tk, p.deduction_pph21, p.deduction_other, p.total_deduction, p.net_salary, p.status, p.payment_date, p.payment_method, p.notes, p.created_at, new Date().toISOString()]
        );
      }
    }
    
    // 7. Insert Assets
    if (jsonData.assets?.length) {
      console.log(`📦 Inserting ${jsonData.assets.length} assets...`);
      for (const a of jsonData.assets) {
        await client.query(
          `INSERT INTO assets (id, name, category, purchase_date, purchase_price, useful_life_years, salvage_value, assigned_to_id, assigned_to_name, location, condition, serial_number, vendor, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [a.id, a.name, a.category, a.purchase_date, a.purchase_price, a.useful_life_years, a.salvage_value, a.assigned_to_id, a.assigned_to_name, a.location, a.condition, a.serial_number, a.vendor, a.notes, a.created_at, new Date().toISOString()]
        );
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    
    // Verify counts
    const counts = await Promise.all([
      client.query('SELECT COUNT(*)::int FROM companies'),
      client.query('SELECT COUNT(*)::int FROM users'),
      client.query('SELECT COUNT(*)::int FROM employees'),
      client.query('SELECT COUNT(*)::int FROM invoices'),
      client.query('SELECT COUNT(*)::int FROM transactions'),
      client.query('SELECT COUNT(*)::int FROM payrolls'),
      client.query('SELECT COUNT(*)::int FROM assets'),
    ]);
    
    console.log('\n📊 Record counts:');
    console.log(`   Companies: ${counts[0].rows[0].count}`);
    console.log(`   Users: ${counts[1].rows[0].count}`);
    console.log(`   Employees: ${counts[2].rows[0].count}`);
    console.log(`   Invoices: ${counts[3].rows[0].count}`);
    console.log(`   Transactions: ${counts[4].rows[0].count}`);
    console.log(`   Payrolls: ${counts[5].rows[0].count}`);
    console.log(`   Assets: ${counts[6].rows[0].count}`);
    
    console.log('\n⚠️  IMPORTANT: All user passwords have been reset to "password123" (bcrypt).');
    console.log('   Users must change their passwords on first login!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});