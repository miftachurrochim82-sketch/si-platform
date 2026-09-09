# SI-PLATFORM — Pemkab Trenggalek
### Portal SSO, Master Hub & Admin Console Terpadu (Global v2.0)

Aplikasi web portal utama berbasis **Google Apps Script (GAS)**, **Vue 3**, dan **Tailwind CSS** yang bertindak sebagai **Penyedia Identitas Tunggal (Single Sign-On Identity Provider)**, **Pusat Manajemen Pengguna & Hak Akses (RBAC)**, dan **Pusat Sinkronisasi Data Master Kepegawaian (SIMPEG Hub)** untuk seluruh aplikasi dinas di lingkungan Pemerintah Kabupaten Trenggalek.

---

## 🏛️ Identitas Aplikasi Google Apps Script

| Properti | Nilai | Keterangan |
|---|---|---|
| **App Code** | `SIPLATFORM` | Kode identitas aplikasi portal utama |
| **Backend Architecture** | `Global v2.0` | High-performance Caching & Transactional Lock Engine |
| **Frontend CDN** | `frontend-cdn@v2.4.0` | Shared UI Tokens & Design Components |
| **Runtime** | `V8` | Modern JavaScript Engine |
| **TimeZone** | `Asia/Jakarta` | WIB (Waktu Indonesia Barat) |

### OAuth Scopes yang Digunakan:
- `https://www.googleapis.com/auth/spreadsheets` (Akses Google Sheets DB)
- `https://www.googleapis.com/auth/drive` (Folder Berkas, Upload & Backup)
- `https://www.googleapis.com/auth/script.storage` (Script Properties & Sesi)
- `https://www.googleapis.com/auth/script.external_request` (SSO HTTP Flow)
- `https://www.googleapis.com/auth/userinfo.email` & `openid` (Identitas Google)

---

## 📦 Struktur Folder Repository

```text
si-platform/
│
├── 🤖 .github/
│   └── workflows/
│       └── deploy-gas.yml          # Skrip CI/CD otomatis deploy ke GAS via Google Clasp
│
├── 📁 src/                          # KODE SUMBER PORTAL APPS SCRIPT
│   ├── appsscript.json             # Manifest GAS, V8 engine, scopes
│   ├── 01_Config.gs                # Konfigurasi konstanta, sheet schemas, headers, cache keys
│   ├── 02_SetupAndSeed.gs          # Setup basis data, seeder permissions, user admin, triggers
│   ├── 03_DataAndAuth.gs           # Database engine, password hashing, session management
│   ├── 04_HandlerAndRouter.gs      # API router, SSO ticket issuance, CRUD handlers, doGet/doPost
│   ├── 05_TestSuite.gs             # Regression & integration test suite (20 test cases)
│   ├── A0_Style.html               # CSS utility & component design tokens
│   ├── A0_Login.html               # Form login manual & Google SSO
│   ├── A1_Sidebar.html             # Sidebar navigasi dinamis berbasis permissions
│   ├── A2_Header.html              # Header bar, dark mode, CSV export, profil user
│   ├── A3_Aplikasi.html            # Launcher grid aplikasi terdaftar
│   ├── A4_Dashboard.html           # Statistik sistem, health checks, & Chart.js
│   ├── A5_User.html                # Manajemen pengguna & modal role assignment
│   ├── A6_Roles.html               # Manajemen role sistem & modal assign permissions
│   ├── A7_Katalog.html             # Katalog daftar izin akses (permissions)
│   ├── A8_FileStorage.html         # Manajemen berkas Drive & upload modal (maks 10MB)
│   ├── A9_Notifikasi.html          # Riwayat notifikasi, kirim pesan & template manager
│   ├── A10_Audit.html              # Log audit trail & pelacakan aktivitas
│   ├── A11_Pengaturan.html         # Pengaturan parameter global JSON & version history
│   └── Index.html                  # Template View Utama Vue 3 Single Page Application
│
├── .clasp.json                     # Konfigurasi Clasp (target rootDir: "src")
├── .gitignore                      # Mengabaikan node_modules & credential
├── package.json                    # NPM scripts (push, pull, deploy, status)
└── README.md                       # Dokumentasi lengkap & panduan penggunaan
```

---

## 🏛️ Peran dalam Ekosistem Terpadu

```text
┌──────────────────────────────────────────────────────────────┐
│             SI-PLATFORM (Portal SSO & Master Hub)            │
│           - Menerbitkan & memvalidasi Tiket SSO              │
│           - Database Master: USERS, ROLES, APPLICATIONS      │
│           - Registry URL Aplikasi Dinas Terdaftar            │
└──────────────────────────────┬───────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│        SI-PELAPORAN          │     │          SI-DILAN            │
│  (Aplikasi Pelaporan ASN)    │     │   (Aplikasi Diklat ASN)      │
│ - Tukar tiket SSO ke sesi    │     │ - Tukar tiket SSO ke sesi    │
│ - Konsumsi Master SIMPEG     │     │ - Konsumsi Master SIMPEG     │
└──────────────────────────────┘     └──────────────────────────────┘
```

---

## 📋 Fitur Utama

- **Single Sign-On (SSO) Provider**:
  - Menerbitkan tiket SSO aman dengan masa berlaku terbatas (`TICKET_TTL_SECONDS`).
  - Endpoint API `/api/v1/auth/validate-ticket` untuk verifikasi tiket lintas aplikasi tanpa kebocoran hash/salt.
- **Role-Based Access Control (RBAC)**:
  - Granular permissions per-resource (`user.*`, `role.*`, `file.*`, `notification.*`, `setting.*`, `audit.*`).
- **Penyimpanan Berkas Terpusat**:
  - Integrasi Google Drive dengan MIME validation, checksum, dan pembatasan ukuran.
- **Pusat Notifikasi Multi-channel**:
  - Antrean pengiriman Email dengan templating variabel dinamis `{{nama_variabel}}`.
- **Audit Trail Real-time**:
  - Pencatatan seluruh aksi pengguna, request ID, resource target, dan status eksekusi.

---

## 🛠️ Konfigurasi Backend (`Script Properties`)

| Key | Deskripsi | Contoh Nilai |
|---|---|---|
| `SPREADSHEET_ID` | ID Google Sheet database master SI-PLATFORM | `1a2b3c...` |
| `DEFAULT_ADMIN_EMAIL` | Email admin default | `admin@trenggalekkab.go.id` |
| `PLATFORM_API_URL` | URL deployment Web App SI-PLATFORM | `https://script.google.com/macros/s/.../exec` |

---

## 🚀 Setup & Deployment

1. Buka Apps Script Editor di Google Workspace.
2. Jalankan fungsi `setup()` di file `02_SetupAndSeed.gs` untuk menyiapkan seluruh sheet, folder Drive, dan akun admin default (`admin` / `admin123`).
3. Jalankan `runAllTests()` di file `05_TestSuite.gs` untuk memverifikasi 20 test suite integrasi.
4. Deploy sebagai **Web App** (Execute as: *Me*, Access: *Anyone*).
5. Jalankan `simpanUrlPlatformSekarang()` atau isi `PLATFORM_API_URL` di Script Properties dengan URL hasil deployment.

---

## 🔄 CI/CD Deployment Otomatis (GitHub Actions & Clasp)

Setiap perubahan di folder `src/` yang di-push ke branch `main` akan otomatis di-deploy ke project Google Apps Script via GitHub Actions (`.github/workflows/deploy-gas.yml`).

---

## 📝 Lisensi
Dikelola oleh Pemerintah Kabupaten Trenggalek.  
Lisensi: MIT.
