# SI-PLATFORM — Pemkab Trenggalek
### Portal Single Sign-On (SSO), Master Hub & Admin Console Terpadu

Aplikasi web portal utama berbasis **Google Apps Script (GAS)**, **Vue 3**, dan **Tailwind CSS** yang bertindak sebagai **Penyedia Identitas Tunggal (Single Sign-On Identity Provider)**, **Pusat Manajemen Pengguna & Hak Akses (RBAC)**, dan **Pusat Sinkronisasi Data Master Kepegawaian (SIMPEG Hub)** untuk seluruh aplikasi dinas di lingkungan Pemerintah Kabupaten Trenggalek.

---

## 🏛️ Identitas & Arsitektur Aplikasi

| Properti | Nilai | Keterangan |
|---|---|---|
| **App Code** | `SIPLATFORM` | Kode identitas aplikasi portal utama |
| **Arsitektur Tampilan** | `2-File HTML System (Single Include)` | `Index.html` (Shell & Bootloader) + `V_Layout.html` (Seluruh Modul Tampilan) |
| **Backend Engine** | `Google Apps Script V8` | High-performance Caching & Transactional Lock Engine |
| **Frontend CDN** | `frontend-cdn@v2.4.0` | Shared UI Tokens & Design Components |
| **Runtime** | `V8 (GAS)` | Modern JavaScript ES6+ Engine |
| **TimeZone** | `Asia/Jakarta` | WIB (Waktu Indonesia Barat) |

### OAuth Scopes:
- `https://www.googleapis.com/auth/spreadsheets` (Akses Google Sheets Database)
- `https://www.googleapis.com/auth/drive` (Manajemen Folder Berkas & Upload)
- `https://www.googleapis.com/auth/script.storage` (Script Properties & Sesi)
- `https://www.googleapis.com/auth/script.external_request` (SSO HTTP Flow & Webhook)
- `https://www.googleapis.com/auth/userinfo.email` & `openid` (Identitas Google Sign-In)

---

## 📦 Struktur Berkas Sumber (`src/`)

```text
si-platform/
│
├── 🤖 .github/
│   └── workflows/
│       └── deploy-gas.yml          # Skrip CI/CD otomatis deploy ke GAS via Clasp
│
├── 📄 .clasp.json                  # Konfigurasi target Google Apps Script (rootDir: "src")
├── 📄 .claspignore                 # Daftar berkas yang diabaikan saat push
├── 📄 package.json & README.md     # Metadata proyek & dokumentasi teknis
├── 📁 scripts/
│   └── set-script-id.js            # Script helper konfigurasi Script ID
│
└── 📁 src/                         # SELURUH SUMBER KODE RESMI (BACKEND & FRONTEND)
    ├── appsscript.json             # Manifest GAS, runtime V8, OAuth scopes
    ├── 01_Config.gs                # Konfigurasi konstanta, sheet schemas, headers, cache keys
    ├── 02_SetupAndSeed.gs          # Setup basis data, seeder permissions, user admin, triggers
    ├── 03_DataAndAuth.gs           # Database engine, password hashing, session management
    ├── 04_HandlerAndRouter.gs      # API router, SSO ticket issuance, CRUD handlers, doGet/doPost
    ├── 05_TestSuite.gs             # Regression & integration test suite (20 test cases)
    │
    ├── Index.html                  # [HTML 1] Root SPA Vue 3, layout shell, AppCore & single include
    └── V_Layout.html               # [HTML 2] Seluruh Modul UI (Login, Sidebar, Header, Apps, User, Role, Storage, Audit, Settings)
```

---

## 📋 Fitur Utama

1. **Pusat Autentikasi Single Sign-On (SSO)**:
   - Login mandiri menggunakan username/email & kata sandi atau Google Workspace ASN.
   - Penerbitan tiket SSO aman (`issue_ticket`) dengan masa berlaku pendek (5 menit) dan verifikasi satu kali pakai (*one-time ticket*).
2. **Katalog Aplikasi Dinas Terintegrasi**:
   - Menampilkan daftar aplikasi dinas (SI-KOMPETENSI, SI-PELAPORAN, SIMPEG, dll.).
   - Tombol *Launch Application* otomatis menyertakan tiket SSO untuk *seamless login*.
3. **Manajemen Pengguna & Role-Based Access Control (RBAC)**:
   - Manajemen akun pegawai, penugasan peran (*roles*), dan katalog hak akses granular (*permissions*).
4. **File Storage & Google Drive Bridge**:
   - Pengelolaan folder berkas, pengunggahan dokumen lampiran, dan integrasi Google Drive terpusat.
5. **Notifikasi Sistem & Multi-Channel Alert**:
   - Pengiriman notifikasi ke email dinas dan notifikasi in-app dengan sistem template variabel dinamis (`{{nama}}`, `{{tanggal}}`).
6. **Audit Trail & Log Aktivitas Real-time**:
   - Pencatatan seluruh aktivitas login, perubahan hak akses, penambahan user, dan penghapusan data secara transparan.
7. **Pengaturan Global Berbasis JSON**:
   - Konfigurasi parameter sistem tanpa perlu mengubah baris kode program.

---

## 🚀 Alur Kerja SSO dengan Aplikasi Anak

```text
┌────────────────────────┐                    ┌────────────────────────┐
│  Aplikasi Anak (Client)│                    │  SI-PLATFORM (SSO Hub) │
│ (si-kompetensi/pelaporan)                   │                        │
└───────────┬────────────┘                    └───────────┬────────────┘
            │                                             │
            │ 1. Pengguna membuka SI-PLATFORM             │
            │    dan memilih aplikasi                     │
            │                                             │
            │ 2. SI-PLATFORM membuat tiket SSO unik       │
            │    lalu me-redirect ke Aplikasi Anak:       │
            │    https://app-anak/exec?ticket=TKT-XYZ     │
            │<────────────────────────────────────────────┤
            │                                             │
            │ 3. Aplikasi Anak menerima tiket di URL,     │
            │    lalu memanggil handler backend:          │
            │    callServer('exchange_platform_ticket')   │
            │                                             │
            │ 4. Backend Aplikasi Anak memvalidasi tiket  │
            │    ke SI-PLATFORM via UrlFetchApp:          │
            │────────────────────────────────────────────>│
            │                                             │
            │ 5. SI-PLATFORM mengembalikan profil ASN,    │
            │    NIP, Unit Kerja, dan Role                │
            │<────────────────────────────────────────────│
            │                                             │
            │ 6. Pengguna langsung masuk ke Dashboard!    │
            ▼                                             ▼
```

---

## 📱 Panduan Deployment di Tablet / Mobile Browser

### Opsi A: Deployment Otomatis via GitHub Actions (CI/CD)
1. Buka repositori di GitHub pada peramban tablet.
2. Masuk ke menu **Settings** ➔ **Secrets and variables** ➔ **Actions**.
3. Tambahkan 2 Secret:
   * `CLASPRC_JSON`: Isi konfigurasi autentikasi Clasp.
   * `CLASP_SCRIPT_ID`: ID Script Google Apps Script SI-PLATFORM Anda.
4. Setiap ada pembaruan di branch `main`, GitHub Actions akan otomatis melakukan `clasp push --force`.

### Opsi B: Salin Manual ke Editor Google Apps Script
1. Buka proyek di [Google Apps Script Editor](https://script.google.com).
2. Buat berkas-berkas sesuai dengan struktur di folder `src/`:
   * 5 Berkas Script (`.gs`): `01_Config.gs` s/d `05_TestSuite.gs`.
   * 2 Berkas HTML (`.html`): `Index.html` dan `V_Layout.html`.
3. Salin kode dari repositori GitHub ke editor Apps Script.
4. Klik **Deploy** ➔ **New deployment** ➔ Pilih tipe **Web app** ➔ Akses: **Anyone**.
