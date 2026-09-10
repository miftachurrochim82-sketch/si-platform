// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 1: CONFIG ====================
// Changelog v2:
// - F7: setupProperties_ hanya mengisi yang kosong (tidak menimpa config benar).
// - Baru: CACHE_DURATION_MASTER + MASTER_CACHE_SHEETS (master di-cache 1 jam).
// - Baru: UUID_SHEETS (sheet bervolume besar pakai UUID, tanpa scan max+1).
// - Baru: AUDIT_LIST_CAP, DASHBOARD_CACHE_SECONDS, MAX_NOTIFICATION_RECIPIENTS.
// - Baru: getOwnExecUrl_() — URL /exec sendiri tanpa hardcode.
// PENTING: Sheet `applications` adalah MASTER URL bisnis. REGISTERED_APPS di bawah
// hanya seed awal. Update URL = edit Sheet, atau update kode + jalankan setup()/syncAppUrlFromCode().

// ==================== KONFIGURASI DASAR ====================
var CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // ⚠️ WAJIB diganti Client ID asli (Google Cloud Console) agar login Google jalan. Selama placeholder, login Google ditolak dengan pesan jelas.
var DEFAULT_ADMIN_EMAIL = 'gakdasatpolppk@gmail.com';
var SPREADSHEET_ID = '1EeJrOo6-75uf8SWCX4P5XPSMoUGXp8p1a098vKBRJys';
var SPREADSHEET_NAME = 'SI-Platform-Database';
var APPLICATION_ID = 'SI-PLATFORM';

var DRIVE_ROOT_FOLDER_ID = '1WmgSufTWg4KNtkD8phKbWsdHDgKIdI7g';
var DRIVE_USERS_FOLDER_ID = '1EudaVBxpU2UzRQZPX1kH9Cu0oXihNp5m';
var DRIVE_APPLICATIONS_FOLDER_ID = '1ra0zQVInOsuBpVOVM-NUReDOwSMT4ux4';
var DRIVE_TEMP_FOLDER_ID = '11UtKsBxzfBA-G6pYZI7wcpgVwNBhQh9e';
var DRIVE_BACKUP_FOLDER_ID = '1xzz6gHtPirRaRvMjCATG-2U1tEVrHTy_';

// ==================== APLIKASI TERDAFTAR AWAL (SEED SAJA) ====================
var REGISTERED_APPS = Object.freeze([
  { code: 'SIMPEG', name: 'Manajemen Kepegawaian', description: 'Sistem Informasi Manajemen Pegawai', url: 'https://script.google.com/macros/s/AKfycbxCpBB4HtAIfKoLDKT5pKev8Xl9KhMjXPfcnSceeOo5r_tgudNXZOSb_q1inOG8tmQ/exec', icon: 'fa-solid fa-users', permission: 'user.read' },
  { code: 'SIKOMPETENSI', name: 'SI-PENGEMBANGAN-KOMPETENSI', description: 'Manajemen pengembangan kompetensi pegawai', url: 'https://script.google.com/macros/s/AKfycbzBy8WWtMeTh2QfihQJ0yjhSlBFFgdOOY6ZFV2S_RDCO0MXpaPEY1sUqqgdO34iWQAQ/exec', icon: 'fa-solid fa-graduation-cap', permission: 'user.read' },
  { code: 'SILAHAR', name: 'SI-LAPORAN-HARIAN', description: 'Laporan harian pegawai', url: 'https://script.google.com/macros/s/AKfycbyjssIwRcvLAlXg_lqbNYqVSTP2kROejlBIOHKQMTyGq1OOZsHicupxQzZQW8W89wcy/exec', icon: 'fa-solid fa-file-lines', permission: 'user.read' },
  { code: 'SIPENGAWASAN', name: 'SI-PENGAWASAN', description: 'Pengawasan internal', url: 'https://script.google.com/macros/s/AKfycbwlPueLcyijm5SOagXXfpGronGuCl1solPi5yqVjqrKS4ivd3EzxMq_psn2yG66UaWheA/exec', icon: 'fa-solid fa-shield-halved', permission: 'user.read' },
  { code: 'SIPELAPORAN', name: 'SI-PELAPORAN', description: 'Sistem informasi pelaporan pegawai', url: 'https://script.google.com/macros/s/AKfycbxoK5-cANH_yzX3WC1MyinwJztYoed0jp3oERGJ8LOfpALO6ITmet-ubQ-xiBloSjqU0g/exec', icon: 'fa-solid fa-file-signature', permission: 'user.read' },
  { code: 'SIUJI', name: 'SI-UJI KONEKSI', description: 'Aplikasi uji integrasi dan koneksi', url: 'https://script.google.com/macros/s/AKfycbx0j0JC-2GCwLjCrFB8yCklztC5_19EqqLJZw4b_fRhho1bAQXfyS82SlHDuVPfnzbQ/exec', icon: 'fa-solid fa-plug', permission: 'user.read' }
]);

// ==================== NAMA SHEET ====================
var SHEETS = Object.freeze({
  USERS: 'users',
  ROLES: 'roles',
  PERMISSIONS: 'permissions',
  USER_ROLES: 'user_roles',
  ROLE_PERMISSIONS: 'role_permissions',
  APPLICATIONS: 'applications',
  SESSIONS: 'sessions',
  AUDIT_EVENTS: 'audit_events',
  SETTINGS: 'settings',
  SETTING_VERSIONS: 'setting_versions',
  SETTING_CHANGE_LOGS: 'setting_change_logs',
  FOLDERS: 'folders',
  FILES: 'files',
  FILE_VERSIONS: 'file_versions',
  FILE_PERMISSIONS: 'file_permissions',
  FILE_ACCESS_LOGS: 'file_access_logs',
  NOTIFICATION_TEMPLATES: 'notification_templates',
  NOTIFICATIONS: 'notifications',
  NOTIFICATION_RECIPIENTS: 'notification_recipients',
  NOTIFICATION_DELIVERIES: 'notification_deliveries',
  NOTIFICATION_READ_RECEIPTS: 'notification_read_receipts',
  NOTIFICATION_CHANNELS: 'notification_channels',
  TICKETS: 'tickets'
});

// Sheet master kecil: aman di-cache lama (1 jam).
var MASTER_CACHE_SHEETS = [
  SHEETS.USERS, SHEETS.ROLES, SHEETS.PERMISSIONS, SHEETS.USER_ROLES,
  SHEETS.ROLE_PERMISSIONS, SHEETS.APPLICATIONS, SHEETS.SETTINGS,
  SHEETS.FOLDERS, SHEETS.NOTIFICATION_TEMPLATES, SHEETS.NOTIFICATION_CHANNELS
];

// Sheet bervolume besar: ID pakai UUID (tanpa scan max+1).
var UUID_SHEETS = [
  SHEETS.SESSIONS, SHEETS.AUDIT_EVENTS, SHEETS.TICKETS,
  SHEETS.NOTIFICATION_RECIPIENTS, SHEETS.NOTIFICATION_DELIVERIES,
  SHEETS.FILE_ACCESS_LOGS
];

// ==================== PERMISSION AWAL ====================
var INITIAL_PERMISSIONS = Object.freeze([
  { resource: 'user', action: 'read', code: 'user.read', description: 'Melihat data user' },
  { resource: 'user', action: 'create', code: 'user.create', description: 'Membuat user baru' },
  { resource: 'user', action: 'update', code: 'user.update', description: 'Mengubah data user' },
  { resource: 'user', action: 'delete', code: 'user.delete', description: 'Menonaktifkan user' },
  { resource: 'user', action: 'export', code: 'user.export', description: 'Mengekspor data user' },
  { resource: 'role', action: 'read', code: 'role.read', description: 'Melihat data role' },
  { resource: 'role', action: 'create', code: 'role.create', description: 'Membuat role baru' },
  { resource: 'role', action: 'update', code: 'role.update', description: 'Mengubah role dan permission' },
  { resource: 'permission', action: 'read', code: 'permission.read', description: 'Melihat katalog permission' },
  { resource: 'audit', action: 'read', code: 'audit.read', description: 'Melihat audit trail' },
  { resource: 'audit', action: 'export', code: 'audit.export', description: 'Mengekspor audit trail' },
  { resource: 'setting', action: 'read', code: 'setting.read', description: 'Melihat setting' },
  { resource: 'setting', action: 'update', code: 'setting.update', description: 'Mengubah setting' },
  { resource: 'file', action: 'read', code: 'file.read', description: 'Melihat file dan folder' },
  { resource: 'file', action: 'upload', code: 'file.upload', description: 'Mengunggah file' },
  { resource: 'file', action: 'update', code: 'file.update', description: 'Mengubah metadata file' },
  { resource: 'file', action: 'delete', code: 'file.delete', description: 'Menghapus file' },
  { resource: 'file', action: 'download', code: 'file.download', description: 'Mengunduh file' },
  { resource: 'folder', action: 'create', code: 'folder.create', description: 'Membuat folder baru' },
  { resource: 'folder', action: 'update', code: 'folder.update', description: 'Mengubah nama atau parent folder' },
  { resource: 'folder', action: 'delete', code: 'folder.delete', description: 'Menghapus folder' },
  { resource: 'notification', action: 'read', code: 'notification.read', description: 'Melihat notifikasi' },
  { resource: 'notification', action: 'send', code: 'notification.send', description: 'Mengirim notifikasi' },
  { resource: 'notification', action: 'manage', code: 'notification.manage', description: 'Mengelola template dan channel' },
  { resource: 'notification', action: 'template_read', code: 'notification.template_read', description: 'Melihat template notifikasi' },
  { resource: 'application', action: 'read', code: 'application.read', description: 'Melihat data aplikasi' },
  { resource: 'application', action: 'create', code: 'application.create', description: 'Mendaftarkan aplikasi baru' },
  { resource: 'application', action: 'update', code: 'application.update', description: 'Mengubah data aplikasi' },
  { resource: 'application', action: 'delete', code: 'application.delete', description: 'Menonaktifkan aplikasi' },
  { resource: 'dashboard', action: 'read', code: 'dashboard.read', description: 'Melihat statistik dashboard' }
]);

// ==================== HEADER UNTUK SETIAP SHEET (JANGAN UBAH URUTAN TANPA MIGRASI) ====================
var HEADERS = Object.freeze({
  users: ['id', 'username', 'email', 'display_name', 'status', 'phone', 'avatar_url', 'last_login_at', 'created_at', 'updated_at', 'password_hash', 'password_salt'],
  roles: ['id', 'code', 'name', 'scope', 'status', 'created_at', 'updated_at'],
  permissions: ['id', 'resource', 'action', 'code', 'description'],
  user_roles: ['user_id', 'role_id', 'assigned_at', 'assigned_by'],
  role_permissions: ['role_id', 'permission_id'],
  applications: ['id', 'code', 'name', 'client_type', 'status', 'description', 'redirect_uri', 'icon_url', 'created_at', 'updated_at'],
  sessions: ['id', 'user_id', 'token', 'created_at', 'expires_at', 'ip', 'user_agent', 'last_activity_at', 'revoked_at'],
  audit_events: ['id', 'timestamp', 'actor_id', 'application_id', 'action', 'resource_type', 'resource_id', 'result', 'ip', 'user_agent', 'request_id', 'correlation_id', 'metadata'],
  settings: ['id', 'key', 'value_json', 'scope_type', 'scope_id', 'version', 'updated_by', 'updated_at'],
  setting_versions: ['id', 'setting_id', 'version_no', 'value_json', 'updated_by', 'updated_at'],
  setting_change_logs: ['id', 'setting_id', 'action', 'old_value', 'new_value', 'changed_by', 'changed_at'],
  folders: ['id', 'name', 'parent_id', 'owner_id', 'drive_folder_id', 'created_at', 'updated_at'],
  files: ['id', 'folder_id', 'owner_id', 'storage_key', 'original_name', 'mime_type', 'size', 'checksum', 'current_version_id', 'is_deleted', 'deleted_at', 'created_at', 'updated_at'],
  file_versions: ['id', 'file_id', 'version_no', 'storage_key', 'checksum', 'size', 'created_by', 'created_at'],
  file_permissions: ['id', 'file_id', 'grant_type', 'grant_id', 'permission'],
  file_access_logs: ['id', 'file_id', 'user_id', 'action', 'timestamp'],
  notification_templates: ['id', 'code', 'name', 'channel', 'subject', 'body_template', 'variables', 'is_active', 'created_at', 'updated_at'],
  notifications: ['id', 'template_id', 'subject', 'body', 'priority', 'status', 'scheduled_at', 'created_by', 'created_at'],
  notification_recipients: ['id', 'notification_id', 'recipient_type', 'recipient_value', 'status', 'created_at'],
  notification_deliveries: ['id', 'notification_id', 'recipient_id', 'channel', 'provider_message_id', 'status', 'sent_at', 'delivered_at', 'failed_at', 'error_message', 'attempt_count'],
  notification_read_receipts: ['id', 'delivery_id', 'read_at', 'metadata'],
  notification_channels: ['id', 'channel', 'provider', 'config_json', 'status', 'created_at'],
  tickets: ['id', 'ticket', 'user_id', 'app_code', 'issued_at', 'expires_at', 'created_at']
});

// ==================== KONSTANTA LAINNYA ====================
var ROLE_SCOPES = Object.freeze(['global', 'application', 'unit']);
var CACHE_DURATION = 60;               // cache pendek (detik) untuk data dinamis
var CACHE_DURATION_MASTER = 3600;      // cache panjang (detik) untuk master kecil
var CLIENT_TYPES = Object.freeze(['web', 'mobile', 'desktop', 'service']);
var MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
var MAX_NOTIFICATION_RETRY = 3;
var MAX_NOTIFICATION_RECIPIENTS = 20;  // tahap 1: batasi agar tidak timeout
var AUDIT_LIST_CAP = 2000;             // list audit dibatasi N terakhir (anti-timeout)
var DASHBOARD_CACHE_SECONDS = 300;     // cache dashboard 5 menit per user
var SCHEMA_VERSION = 1;
var ENABLE_HEALTH_CHECK = true;
var TICKET_TTL_SECONDS = 3600; // berlaku 1 jam
var TICKET_CACHE_PREFIX = 'app_ticket_';

// ==================== FUNGSI BANTU KONFIGURASI ====================
function getConfig_(key, fallback) {
  try {
    var props = PropertiesService.getScriptProperties();
    var value = props.getProperty(key);
    return value || fallback;
  } catch (e) {
    return fallback;
  }
}

// F7: hanya mengisi property yang MASIH KOSONG. Tidak menimpa yang sudah benar.
function setupProperties_() {
  var props = PropertiesService.getScriptProperties();
  var mapConfig = {
    'SPREADSHEET_ID': SPREADSHEET_ID,
    'DRIVE_ROOT_FOLDER_ID': DRIVE_ROOT_FOLDER_ID,
    'DRIVE_USERS_FOLDER_ID': DRIVE_USERS_FOLDER_ID,
    'DRIVE_APPLICATIONS_FOLDER_ID': DRIVE_APPLICATIONS_FOLDER_ID,
    'DRIVE_TEMP_FOLDER_ID': DRIVE_TEMP_FOLDER_ID,
    'DRIVE_BACKUP_FOLDER_ID': DRIVE_BACKUP_FOLDER_ID,
    'DEFAULT_ADMIN_EMAIL': DEFAULT_ADMIN_EMAIL,
    'CLIENT_ID': CLIENT_ID
  };
  Object.keys(mapConfig).forEach(function(key) {
    if (!props.getProperty(key) && mapConfig[key]) {
      props.setProperty(key, mapConfig[key]);
      Logger.log('Properties diisi: ' + key);
    }
  });
  Logger.log('Properties Service siap (hanya mengisi yang kosong).');
}

// URL /exec deployment ini sendiri, tanpa hardcode.
function getOwnExecUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
