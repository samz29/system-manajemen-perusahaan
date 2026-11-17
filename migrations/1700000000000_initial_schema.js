exports.up = function(pgm) {
  // Companies table (single row)
  pgm.createTable('companies', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true },
    tagline: { type: 'varchar(255)' },
    address: { type: 'text' },
    phone: { type: 'varchar(50)' },
    email: { type: 'varchar(255)' },
    website: { type: 'varchar(255)' },
    npwp: { type: 'varchar(50)' },
    bank_name: { type: 'varchar(100)' },
    bank_account_number: { type: 'varchar(50)' },
    bank_account_holder: { type: 'varchar(100)' },
    currency: { type: 'varchar(3)', default: 'IDR' },
    currency_symbol: { type: 'varchar(5)', default: 'Rp' },
    tax_rate: { type: 'numeric(5,2)', default: 11 },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') }
  });

  // Users table
  pgm.createTable('users', {
    id: { type: 'varchar(20)', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'varchar(20)', notNull: true, check: "role IN ('SUPER_ADMIN','FINANCE','HR','STAFF')" },
    employee_id: { type: 'varchar(20)' },
    position: { type: 'varchar(100)' },
    status: { type: 'varchar(20)', default: 'Aktif', check: "status IN ('Aktif','Nonaktif')" },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    last_login: { type: 'timestamptz' }
  });
  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'employee_id');
  pgm.createIndex('users', 'role');

  // Sessions table
  pgm.createTable('sessions', {
    token: { type: 'varchar(100)', primaryKey: true },
    user_id: { type: 'varchar(20)', notNull: true, references: 'users(id)' },
    created_at: { type: 'bigint', notNull: true },
    expires_at: { type: 'bigint', notNull: true }
  });
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'expires_at');

  // Employees table
  pgm.createTable('employees', {
    id: { type: 'varchar(20)', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true },
    email: { type: 'varchar(255)' },
    phone: { type: 'varchar(50)' },
    position: { type: 'varchar(100)', notNull: true },
    department: { type: 'varchar(100)', notNull: true },
    employment_type: { type: 'varchar(20)', default: 'Tetap', check: "employment_type IN ('Tetap','Kontrak','Magang')" },
    join_date: { type: 'date', notNull: true },
    status: { type: 'varchar(20)', default: 'Aktif', check: "status IN ('Aktif','Nonaktif','Resign')" },
    bank_name: { type: 'varchar(100)' },
    bank_account: { type: 'varchar(50)' },
    basic_salary: { type: 'numeric(15,2)', default: 0 },
    allowance_transport: { type: 'numeric(15,2)', default: 0 },
    allowance_meal: { type: 'numeric(15,2)', default: 0 },
    allowance_position: { type: 'numeric(15,2)', default: 0 },
    bpjs_kesehatan: { type: 'numeric(15,2)', default: 0 },
    bpjs_ketenagakerjaan: { type: 'numeric(15,2)', default: 0 },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') }
  });
  pgm.createIndex('employees', 'status');
  pgm.createIndex('employees', 'department');

  // Invoices table
  pgm.createTable('invoices', {
    id: { type: 'varchar(50)', primaryKey: true },
    invoice_number: { type: 'varchar(50)', notNull: true, unique: true },
    date: { type: 'date', notNull: true },
    due_date: { type: 'date', notNull: true },
    status: { type: 'varchar(20)', notNull: true, check: "status IN ('Draft','Terkirim','Lunas','Jatuh Tempo','Dibatalkan')", default: 'Draft' },
    client_name: { type: 'varchar(255)', notNull: true },
    client_attn: { type: 'varchar(255)' },
    client_email: { type: 'varchar(255)' },
    client_phone: { type: 'varchar(50)' },
    client_address: { type: 'text' },
    items: { type: 'jsonb', notNull: true, default: '[]' },
    subtotal: { type: 'numeric(15,2)', default: 0 },
    tax_rate: { type: 'numeric(5,2)', default: 11 },
    tax_amount: { type: 'numeric(15,2)', default: 0 },
    discount_amount: { type: 'numeric(15,2)', default: 0 },
    grand_total: { type: 'numeric(15,2)', default: 0 },
    notes: { type: 'text' },
    payment_date: { type: 'date' },
    payment_method: { type: 'varchar(100)' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') }
  });
  pgm.createIndex('invoices', 'status');
  pgm.createIndex('invoices', 'date');
  pgm.createIndex('invoices', 'client_name');
  pgm.createIndex('invoices', 'invoice_number');

  // Invoice items index (GIN for JSONB)
  pgm.createIndex('invoices', 'items', { method: 'gin' });

  // Transactions table
  pgm.createTable('transactions', {
    id: { type: 'varchar(50)', primaryKey: true },
    date: { type: 'date', notNull: true },
    type: { type: 'varchar(20)', notNull: true, check: "type IN ('Pemasukan','Pengeluaran')" },
    category: { type: 'varchar(100)', notNull: true },
    amount: { type: 'numeric(15,2)', notNull: true },
    description: { type: 'text' },
    payment_method: { type: 'varchar(100)', default: 'Kas Tunai' },
    reference: { type: 'varchar(100)' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') }
  });
  pgm.createIndex('transactions', 'date');
  pgm.createIndex('transactions', 'type');
  pgm.createIndex('transactions', 'category');
  pgm.createIndex('transactions', 'reference');

  // Payrolls table
  pgm.createTable('payrolls', {
    id: { type: 'varchar(50)', primaryKey: true },
    period: { type: 'varchar(7)', notNull: true }, // YYYY-MM
    period_label: { type: 'varchar(50)' },
    employee_id: { type: 'varchar(20)', notNull: true, references: 'employees(id)' },
    employee_name: { type: 'varchar(255)', notNull: true },
    employee_position: { type: 'varchar(100)' },
    employee_department: { type: 'varchar(100)' },
    basic_salary: { type: 'numeric(15,2)', default: 0 },
    allowance_transport: { type: 'numeric(15,2)', default: 0 },
    allowance_meal: { type: 'numeric(15,2)', default: 0 },
    allowance_position: { type: 'numeric(15,2)', default: 0 },
    total_allowance: { type: 'numeric(15,2)', default: 0 },
    bonus: { type: 'numeric(15,2)', default: 0 },
    overtime: { type: 'numeric(15,2)', default: 0 },
    gross_salary: { type: 'numeric(15,2)', default: 0 },
    deduction_bpjs_ks: { type: 'numeric(15,2)', default: 0 },
    deduction_bpjs_tk: { type: 'numeric(15,2)', default: 0 },
    deduction_pph21: { type: 'numeric(15,2)', default: 0 },
    deduction_other: { type: 'numeric(15,2)', default: 0 },
    total_deduction: { type: 'numeric(15,2)', default: 0 },
    net_salary: { type: 'numeric(15,2)', default: 0 },
    status: { type: 'varchar(20)', notNull: true, check: "status IN ('Draft','Siap Bayar','Dibayar')", default: 'Draft' },
    payment_date: { type: 'date' },
    payment_method: { type: 'varchar(100)' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') }
  });
  pgm.createIndex('payrolls', 'period');
  pgm.createIndex('payrolls', 'employee_id');
  pgm.createIndex('payrolls', 'status');
  pgm.createIndex('payrolls', ['period', 'employee_id'], { unique: true });

  // Assets table
  pgm.createTable('assets', {
    id: { type: 'varchar(50)', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true },
    category: { type: 'varchar(100)', notNull: true },
    purchase_date: { type: 'date', notNull: true },
    purchase_price: { type: 'numeric(15,2)', default: 0 },
    useful_life_years: { type: 'integer', default: 4 },
    salvage_value: { type: 'numeric(15,2)', default: 0 },
    assigned_to_id: { type: 'varchar(20)', references: 'employees(id)' },
    assigned_to_name: { type: 'varchar(255)' },
    location: { type: 'varchar(255)', default: 'Kantor Pusat' },
    condition: { type: 'varchar(50)', default: 'Baik', check: "condition IN ('Sangat Baik','Baik','Dalam Perbaikan','Rusak / Usang')" },
    serial_number: { type: 'varchar(100)' },
    vendor: { type: 'varchar(255)' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') }
  });
  pgm.createIndex('assets', 'category');
  pgm.createIndex('assets', 'condition');
  pgm.createIndex('assets', 'assigned_to_id');
  pgm.createIndex('assets', 'purchase_date');

  // Insert default company row
  pgm.sql(`
    INSERT INTO companies (name, tagline, address, phone, email, website, npwp, bank_name, bank_account_number, bank_account_holder, currency, currency_symbol, tax_rate)
    VALUES (
      'PT Sinar Digital Nusantara',
      'Solusi Teknologi & Layanan Manajemen Bisnis',
      'Gedung Cyber 2 Lantai 12, Jl. H.R. Rasuna Said Blok X-5, Kuningan, Jakarta Selatan 12950',
      '+62 21 555-0899',
      'finance@sinardigital.co.id',
      'https://sinardigital.co.id',
      '01.345.678.9-012.000',
      'Bank Central Asia (BCA)',
      '8801-9234-5561',
      'PT SINAR DIGITAL NUSANTARA',
      'IDR',
      'Rp',
      11
    ) ON CONFLICT DO NOTHING;
  `);
};

exports.down = function(pgm) {
  pgm.dropTable('assets');
  pgm.dropTable('payrolls');
  pgm.dropTable('transactions');
  pgm.dropTable('invoices');
  pgm.dropTable('employees');
  pgm.dropTable('sessions');
  pgm.dropTable('users');
  pgm.dropTable('companies');
};