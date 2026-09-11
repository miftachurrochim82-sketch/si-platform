# SI-PLATFORM — Pemkab Trenggalek
### Portal SSO, Master Hub & Admin Console Terpadu (Modern Modular Edition)

Aplikasi web portal utama berbasis **Google Apps Script (GAS)**, **Vue 3**, dan **Tailwind CSS** yang bertindak sebagai **Penyedia Identitas Tunggal (Single Sign-On Identity Provider)**, **Pusat Manajemen Pengguna & Hak Akses (RBAC)**, dan **Pusat Sinkronisasi Data Master Kepegawaian (SIMPEG Hub)** untuk seluruh aplikasi dinas di lingkungan Pemerintah Kabupaten Trenggalek.

---

## 🏛️ Identitas & Arsitektur Aplikasi

| Properti | Nilai | Keterangan |
|---|---|---|
| **App Code** | `SIPLATFORM` | Kode identitas aplikasi portal utama |
| **Arsitektur Tampilan** | `Modular 5-View System` | Menggabungkan 11 file lama menjadi 5 modul tematik yang ringkas & ringan |
| **Backend Engine** | `Global v2.0 V8` | High-performance Caching & Transactional Lock Engine |
| **Frontend CDN** | `frontend-cdn@v2.4.0` | Shared UI Tokens & Design Components |
| **Runtime** | `V8 (GAS)` | Modern JavaScript ES6+ Engine |
| **TimeZone** | `Asia/Jakarta` | WIB (Waktu Indonesia Barat) |

### OAuth Scopes:
- `https://www.googleapis.com/auth/spreadsheets` (Akses Google Sheets DB)
- `https://www.googleapis.com/auth/drive` (Folder Berkas, Upload & Backup)
- `https://www.googleapis.com/auth/script.storage` (Script Properties & Sesi)
- `https://www.googleapis.com/auth/script.external_request` (SSO HTTP Flow)
- `https://www.googleapis.com/auth/userinfo.email` & `openid` (Identitas Google)

---

## 📦 Struktur Folder Repository (Ringkas & Tablet-Friendly)

```text
si-platform/
│
├── 🤖 .github/
│   └── workflows/
│       └── deploy-gas.yml          # Skrip CI/CD otomatis deploy ke GAS via Google Clasp
│
├── 📁 src/                          # KODE SUMBER APPS SCRIPT (RINGKAS & MODULAR)
│   ├── appsscript.json             # Manifest GAS, runtime V8, scopes
│   ├── 01_Config.gs                # Konfigurasi konstanta, sheet schemas, headers, cache keys
│   ├── 02_SetupAndSeed.gs          # Setup basis data, seeder permissions, user admin, triggers
│   ├── 03_DataAndAuth.gs           # Database engine, password hashing, session management
│   ├── 04_HandlerAndRouter.gs      # API router, SSO ticket issuance, CRUD handlers, doGet/doPost
│   ├── 05_TestSuite.gs             # Regression & integration test suite (20 test cases)
│   │
│   ├── Index.html                  # Root SPA Vue 3, layout shell, global state & modals
│   ├── V_Layout.html               # Modul Navigasi: Form Login, Sidebar & Top Header Bar
│   ├── V_Portal.html               # Modul 1: Katalog Aplikasi Terdaftar & Dashboard Statistik
│   ├── V_Akses.html                # Modul 2: Manajemen User, Hak Akses Roles & Katalog Izin
│   ├── V_Layanan.html              # Modul 3: File Storage Google Drive & Notifikasi Multi-channel
│   └── V_Sistem.html               # Modul 4: Audit Trail Realtime & Pengaturan Global JSON
│
├── .clasp.json                     # Konfigurasi Clasp (target rootDir: "src")
├── .gitignore                      # Mengabaikan file sensitif & cache
├── package.json                    # NPM scripts & dependensi pendukung
└── README.md                       # Dokumentasi lengkap & panduan teknis
```

---

## 🧩 Modul Tampilan (Modular Views)

1. **`V_Layout.html` (Auth & Navigation)**
   - Layar Autentikasi Modern (Google SSO + Login Form Manual).
   - Sidebar navigasi dinamis berbasis hak akses (*Permission-aware*).
   - Top Header bar, Dark/Light mode toggle, CSV export, & profil pengguna.

2. **`V_Portal.html` (Katalog Aplikasi & Dashboard)**
   - Launcher grid aplikasi dinas terdaftar (*Single Sign-On launcher*).
   - Ringkasan KPI statistik, health check server, & tren aktivitas Chart.js.

3. **`V_Akses.html` (Pengguna, Roles & Izin)**
   - Manajemen akun pengguna (CRUD, aktivasi, reset password, pencarian multi-filter).
   - Role-Based Access Control (RBAC) & modal konfigurasi izin per role.
   - Katalog permissions granular (`user.*`, `role.*`, `file.*`, `notification.*`, `setting.*`, `audit.*`).

4. **`V_Layanan.html` (Storage & Notifikasi)**
   - Penyimpanan berkas Google Drive dengan validasi MIME dan pembatasan ukuran 10MB.
   - Broadcast notifikasi email/WhatsApp dengan templating variabel `{{nama}}`.

5. **`V_Sistem.html` (Audit & Pengaturan)**
   - Audit Trail logging real-time untuk seluruh aksi CRUD dan autentikasi.
   - Pengaturan global berbasis JSON tersentralisasi dengan riwayat versi (*version history*).

---

## 🛠️ Konfigurasi Backend (`Script Properties`)

| Key | Deskripsi | Contoh Nilai |
|---|---|---|
| `SPREADSHEET_ID` | ID Google Sheet database master SI-PLATFORM | `1a2b3c...` |
| `DEFAULT_ADMIN_EMAIL` | Email admin default | `admin@trenggalekkab.go.id` |
| `PLATFORM_API_URL` | URL deployment Web App SI-PLATFORM | `https://script.google.com/macros/s/.../exec` |

---

## 🚀 Setup & Deployment Cepat

1. Buka Apps Script Editor di Google Workspace.
2. Jalankan fungsi `setup()` di file `02_SetupAndSeed.gs` untuk menginisialisasi sheet, folder Drive, dan akun default (`admin` / `admin123`).
3. Jalankan `runAllTests()` di file `05_TestSuite.gs` untuk memverifikasi seluruh modul.
4. Deploy sebagai **Web App** (Execute as: *Me*, Access: *Anyone*).
5. Jalankan `simpanUrlPlatformSekarang()` atau isi `PLATFORM_API_URL` di Script Properties.

---

## 🔄 CI/CD Deployment Otomatis (GitHub Actions & Clasp)

Setiap perubahan di branch `main` akan otomatis di-deploy ke project Google Apps Script via GitHub Actions (`.github/workflows/deploy-gas.yml`) dengan dukungan Cloud Shell OAuth Client ID.

---

## 📝 Lisensi
Dikelola oleh Pemerintah Kabupaten Trenggalek.  
Lisensi: MIT.
