# Deploy ke aaPanel - Production Checklist

## 1. Persiapan Server (aaPanel)

### Install Dependencies via aaPanel App Store:
- **Node.js** (v18+ atau v20 LTS) → *Software Store → Node.js*
- **PostgreSQL** (v15+) → *Software Store → PostgreSQL*
- **PM2 Manager** → *Software Store → PM2 Manager*
- **Nginx** (sudah terinstall default aaPanel)

### Buat Database PostgreSQL:
```
Database: company_mgmt
User: company_user
Password: [generate strong password]
```

---

## 2. Upload Code ke Server

### Option A: Git Clone (Recommended)
```bash
# SSH ke server
cd /www/wwwroot/
git clone https://github.com/samz29/system-manajemen-perusahaan.git
cd system-manajemen-perusahaan
```

### Option B: Upload via aaPanel File Manager
- Zip folder project → Upload ke `/www/wwwroot/system-manajemen-perusahaan/`
- Extract di situ

---

## 3. Konfigurasi Environment

```bash
cd /www/wwwroot/system-manajemen-perusahaan
cp .env.example .env
nano .env
```

**Isi `.env` production:**
```env
# Server
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-domain.com

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=generate-64-char-random-string-here

# PostgreSQL (sesuaikan dengan yang dibuat di aaPanel)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=company_mgmt
DB_USER=company_user
DB_PASSWORD=your-strong-password
DB_POOL_MAX=20
```

**Generate SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. Install Dependencies & Migrasi Database

```bash
cd /www/wwwroot/system-manajemen-perusahaan

# Install dependencies
npm install --production

# Jalankan migrasi PostgreSQL
npm run db:migrate

# (Opsional) Migrasi data dari JSON lama
npm run db:migrate-data

# Atau seed admin baru jika database kosong
# npm run db:seed
```

---

## 5. Setup PM2 via aaPanel

### Via PM2 Manager (GUI):
1. Buka **PM2 Manager** di aaPanel sidebar
2. Klik **Add Project**
3. Isi:
   - **Project Name**: `company-app`
   - **Startup File**: `/www/wwwroot/system-manajemen-perusahaan/server.js`
   - **Interpreter**: `node` (atau path lengkap `/usr/bin/node`)
   - **Args**: `--max-old-space-size=512`
   - **Environment Variables**: (kosong, sudah baca .env)
   - **Instances**: `max` (cluster mode) atau `1`
4. Klik **Start**

### Via CLI (alternatif):
```bash
# Buat ecosystem.config.js di root project
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'company-app',
    script: 'server.js',
    cwd: '/www/wwwroot/system-manajemen-perusahaan',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/www/wwwlogs/company-app-error.log',
    out_file: '/www/wwwlogs/company-app-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '1G',
    watch: false
  }]
};
EOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 6. Konfigurasi Nginx Reverse Proxy (aaPanel)

### Via aaPanel Website Panel:
1. **Website** → **Add Site**
   - Domain: `your-domain.com`
   - Root: `/www/wwwroot/system-manajemen-perusahaan/public` (static files)
   - PHP: **Static** / **None**

2. Masuk ke **Settings** → **Configuration** → **Edit Config**
   Tambahkan di blok `server { ... }`:

```nginx
# Proxy API & App ke Node.js
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
}

# Static files caching (optional)
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    proxy_pass http://127.0.0.1:3000;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

3. **SSL** → Let's Encrypt → Request Certificate → Force HTTPS

---

## 7. Firewall & Security (aaPanel)

### Security → Firewall:
- Allow: `22` (SSH), `80`, `443`, `8888` (aaPanel)
- Block: `3000` (Node.js direct access)

### Security → SSH:
- Disable password login, gunakan SSH Key
- Change port dari 22 ke custom (optional)

### Security → Fail2Ban:
- Enable untuk SSH, Nginx

---

## 8. Backup Otomatis (aaPanel Cron)

### Crontab → Add Task:
```bash
# Backup database harian jam 02:00
0 2 * * * /usr/bin/pg_dump -h localhost -U company_user company_mgmt | gzip > /www/backup/db_$(date +\%Y\%m\%d).sql.gz

# Backup files mingguan
0 3 * * 0 tar -czf /www/backup/files_$(date +\%Y\%m\%d).tar.gz /www/wwwroot/system-manajemen-perusahaan --exclude=node_modules --exclude=.git

# Hapus backup > 30 hari
0 4 * * * find /www/backup -name "*.gz" -mtime +30 -delete
```

---

## 9. Monitoring & Logs

### PM2 Logs:
```bash
pm2 logs company-app
pm2 monit
```

### Nginx Logs (aaPanel):
- `/www/wwwlogs/your-domain.com.access.log`
- `/www/wwwlogs/your-domain.com.error.log`

### App Logs:
- `/www/wwwlogs/company-app-out.log`
- `/www/wwwlogs/company-app-error.log`

---

## 10. Post-Deploy Verification

```bash
# 1. Test API
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@perusahaan.com","password":"admin123"}'

# 2. Cek health
curl https://your-domain.com/api/dashboard \
  -H "Authorization: Bearer <token-from-step-1>"

# 3. Ganti password admin segera!
# Login ke UI → Pengguna → Edit Admin → Change Password
```

---

## 11. Update/Deploy Baru

```bash
cd /www/wwwroot/system-manajemen-perusahaan
git pull origin master
npm install --production
npm run db:migrate   # jalankan migrasi baru jika ada
pm2 reload company-app
```

---

## Troubleshooting

| Issue | Solusi |
|-------|--------|
| `EADDRINUSE` port 3000 | `pm2 delete all` lalu restart, atau cek `netstat -tulpn \| grep 3000` |
| Database connection failed | Cek `.env` DB credentials, pastikan PostgreSQL running, firewall allow 5432 localhost |
| Static files 404 | Pastikan Nginx root ke `/public`, atau serve static via Node (sudah di server.js) |
| CORS error | Pastikan `FRONTEND_URL=https://your-domain.com` di `.env` |
| PM2 tidak start | Cek `pm2 logs`, pastikan `node server.js` jalan manual dulu |

---

## File Penting untuk Production

```
system-manajemen-perusahaan/
├── .env                    # JANGAN COMMIT - credentials production
├── ecosystem.config.js     # PM2 config
├── server.js               # Entry point
├── db-pg.js               # PostgreSQL adapter
├── migrations/            # Schema migrations
└── public/                # Static files (served by Nginx)
```