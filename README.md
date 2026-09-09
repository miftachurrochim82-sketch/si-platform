# SI-PLATFORM — Pemkab Trenggalek
### Portal SSO & Pusat Data Master Kepegawaian SIMPEG

Aplikasi web portal utama berbasis **Google Apps Script (GAS)**, **Vue 3**, dan **Tailwind CSS** yang bertindak sebagai **Penyedia Identitas Tunggal (Single Sign-On Identity Provider)** dan **Pusat Sinkronisasi Data Master Kepegawaian (SIMPEG Hub)** untuk seluruh aplikasi dinas di lingkungan Pemerintah Kabupaten Trenggalek.

---

## 🏛️ Identitas Aplikasi Google Apps Script

| Properti | Nilai | Keterangan |
|---|---|---|
| **App Code** | `SIPLATFORM` | Kode identitas aplikasi portal utama |
| **Backend Library** | `CoreLib` (`1GmeYflfMpRa1iTVgFHRD6K1DMoxc9OoKqpuucPJXgNZ9XBK06O7wgDkO`) | Global Core Foundation v2.0 |
| **Frontend CDN** | `frontend-cdn@v2.2.5` | Shared UI Components & AppCore |
| **Runtime** | `V8` | Modern JavaScript Engine |
| **TimeZone** | `Asia/Jakarta` | WIB (Waktu Indonesia Barat) |

### OAuth Scopes yang Digunakan:
- `https://www.googleapis.com/auth/spreadsheets` (Akses Google Sheets DB)
- `https://www.googleapis.com/auth/drive` (Folder Evidence & Backup)
- `https://www.googleapis.com/auth/script.storage` (Script Properties & Sesi)
- `https://www.googleapis.com/auth/script.external_request` (SSO SI-Platform HTTP)
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
│   ├── appsscript.json             # Manifest GAS, V8 engine, scopes, & library CoreLib
│   ├── 01_Config.gs                # Definisi konstanta, header master, & cache helper
│   ├── 02_AuthEngine.gs            # Engine SSO Ticket generation, validation, & user lookup
│   ├── 03_MasterDataEngine.gs      # CRUD & query engine Pegawai, Unit, Jabatan, & App Registry
│   ├── 04_PortalRouter.gs          # Entrypoint doGet, doPost, & dispatcher API
│   ├── 05_SeedMasterData.gs        # Seeder data master SIMPEG & aplikasi terdaftar
│   ├── 99_PlatformTestSuite.gs     # Test suite otomatis validasi tiket SSO & database
│   └── Index.html                  # Tampilan Web App Portal SSO & App Launcher (Vue 3)
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
│             SI-PLATFORM (Portal SSO & Master Data)           │
│           - Menerbitkan & memvalidasi Tiket SSO              │
│           - Database Master: PEGAWAI, UNIT_KERJA, JABATAN    │
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
  - Menerbitkan tiket SSO satu kali pakai (*single-use time-limited ticket*) untuk aplikasi konsumen.
  - Endpoint API `validate_ticket` / `exchange_ticket` untuk pertukaran tiket dengan profil pegawai lengkap.
- **Master Data Kepegawaian (SIMPEG)**:
  - Database terpusat untuk Pegawai, Unit Kerja (OPD), Formasi Jabatan, dan Hak Akses Pengguna.
- **App Launcher / Portal Beranda**:
  - Tampilan beranda modern bagi seluruh ASN untuk meluncurkan aplikasi dinas terdaftar cukup dengan 1 klik tanpa login berulang.
- **Registry Aplikasi Dinas**:
  - Manajemen daftar aplikasi terdaftar (`kode_app`, `url_exec`, ikon, deskripsi, urutan).

---

## 🛠️ Konfigurasi Backend (`Script Properties`)

| Key | Deskripsi | Contoh Nilai |
|---|---|---|
| `APP_CODE` | Kode unik aplikasi portal | `SIPLATFORM` |
| `SPREADSHEET_ID` | ID Google Sheet database master SIMPEG | `1a2b3c...` |

---

## 🚀 Setup & Deployment

1. Buka Apps Script Editor di Google Workspace.
2. Hubungkan Library `CoreLib` (Script ID: `1GmeYflfMpRa1iTVgFHRD6K1DMoxc9OoKqpuucPJXgNZ9XBK06O7wgDkO`).
3. Jalankan fungsi `seedMasterPlatform()` di file `05_SeedMasterData.gs` untuk menyiapkan skema sheet dan data awal.
4. Jalankan `runPlatformDiagnostics()` di `99_PlatformTestSuite.gs` untuk memverifikasi SSO ticket generation dan integrasi sheet.
5. Deploy sebagai **Web App** (Execute as: *User accessing the web app* / *Me*, Access: *Anyone*).
6. Catat URL Web App hasil deploy, lalu gunakan sebagai `PLATFORM_API_URL` pada aplikasi-aplikasi dinas (seperti SI-PELAPORAN dan SI-DILAN).

---

## 🔄 CI/CD Deployment Otomatis (GitHub Actions & Clasp)

Setiap perubahan di folder `src/` yang di-push ke branch `main` akan otomatis di-deploy ke project Google Apps Script via GitHub Actions (`.github/workflows/deploy-gas.yml`).

---

## 📝 Lisensi
Dikelola oleh Pemerintah Kabupaten Trenggalek.  
Lisensi: MIT.
