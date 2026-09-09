// ============================================================
// SI-PLATFORM - 01_Config.gs
// Portal SSO & Pusat Master Data Kepegawaian SIMPEG
// Pemerintah Kabupaten Trenggalek
// ============================================================

var APP_TITLE = 'SI-PLATFORM';
var APP_CODE = 'SIPLATFORM';

function appProps_() { return PropertiesService.getScriptProperties(); }

var SPREADSHEET_ID = CoreLib.getEnvProperty('SPREADSHEET_ID', appProps_()) || (function() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getId(); } catch(e) { return ''; }
})();

var TICKET_PREFIX = 'PLATFORM_TICKET_';
var TICKET_TTL_SECONDS = 300; // 5 Menit untuk pertukaran tiket SSO
var SESSION_PREFIX = 'PLATFORM_SESSION_';
var SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 Jam sesi portal
var DATA_CACHE_TTL = 300; // 5 Menit cache data master

// ==================== DAFTAR HEADER SHEET MASTER ====================
var PLATFORM_SHEET_HEADERS = {
  USERS: [
    'id', 'email', 'nama', 'nip', 'role', 'status', 'last_login',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at'
  ],
  PEGAWAI: [
    'id', 'nip', 'nama', 'email', 'unit_id', 'jabatan_id', 'status',
    'pangkat_golongan', 'alamat', 'no_hp',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at'
  ],
  UNIT_KERJA: [
    'id', 'kode_unit', 'nama_unit', 'jenis_unit', 'status',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at'
  ],
  JABATAN: [
    'id', 'kode_jabatan', 'nama_jabatan', 'unit_id', 'jenis_jabatan', 'status_jabatan',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at'
  ],
  APLIKASI: [
    'id', 'kode_app', 'nama_app', 'url_exec', 'icon', 'deskripsi', 'urutan', 'status',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at'
  ],
  KONFIGURASI: [
    'id', 'key', 'value', 'keterangan',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at'
  ],
  AUDIT_LOGS: [
    'id', 'user_id', 'action', 'timestamp', 'details'
  ]
};

function getAllHeaders_() {
  return PLATFORM_SHEET_HEADERS;
}

function getDb_() {
  return CoreLib.getDb(SPREADSHEET_ID);
}

function readRecordsNoLock_(sheetName) {
  return CoreLib.readRecordsNoLock(SPREADSHEET_ID, sheetName, getAllHeaders_());
}

function getSheetDataCached_(sheetName) {
  return CoreLib.getSheetDataCached(SPREADSHEET_ID, sheetName, getAllHeaders_(), DATA_CACHE_TTL);
}

function writeRecordNoLock_(sheetName, record, isUpdate, actor, pkField) {
  return CoreLib.writeRecordNoLock(SPREADSHEET_ID, sheetName, record, isUpdate, actor, getAllHeaders_(), function() { return false; }, pkField);
}

function softDeleteRecordNoLock_(sheetName, id, actor, pkField) {
  return CoreLib.softDeleteRecordNoLock(SPREADSHEET_ID, sheetName, id, actor, getAllHeaders_(), function() { return false; }, pkField);
}

function invalidateCache_(sheetName) {
  CoreLib.invalidateSheetCache(sheetName, SPREADSHEET_ID);
}
