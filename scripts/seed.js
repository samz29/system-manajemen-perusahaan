const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.json');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

const defaultData = {
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
    tax_rate: 11
  },
  employees: [],
  invoices: [],
  transactions: [],
  payrolls: [],
  assets: [],
  users: [
    {
      id: "USR-001",
      name: "Administrator",
      email: "admin@perusahaan.com",
      password_hash: hashPassword("admin123"),
      role: "SUPER_ADMIN",
      employee_id: null,
      position: "Direktur / Pemilik",
      status: "Aktif",
      created_at: new Date().toISOString(),
      last_login: null
    }
  ],
  sessions: {}
};

function seed() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf-8');
  console.log('✅ Database seeded successfully!');
  console.log('📧 Default admin login:');
  console.log('   Email: admin@perusahaan.com');
  console.log('   Password: admin123');
  console.log('');
  console.log('⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!');
}

seed();