// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 2: SETUP & SEED ====================
// Changelog v2:
// - F6: getOrCreateSpreadsheet_ gagal-buka-ID = ERROR KERAS (tidak bikin DB baru diam-diam).
// - F5: seedApplications_ update URL yang berubah + log; tambah syncAppUrlFromCode().
// - F8: seed folder/channel pakai ID berurutan (anti-kembar).
// - F10c: setup() pasang trigger bersih session harian.
// - syncRolePermissions_: pakai lock + pertahankan role custom (kasat/kabid/dll).
// - syncUserRoles_: guard jika role dasar belum ada + area mapping ditandai.
// - backupSpreadsheet_: perbaiki addFile/removeFile + nama timestamp.
// Aman dijalankan ulang.

function setup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    setupProperties_(); // F7: hanya isi yang kosong
    var ss = getOrCreateSpreadsheet_();
    initializeSheets_(ss);
    seedInitialData_(ss);
    migrate_();
    setupNotificationTrigger_();
    setupBackupTrigger_();
    setupErrorRateTrigger_();
    setupSessionCleanupTrigger_(); // F10c: baru
    Logger.log('✅ Setup selesai. Spreadsheet ID: ' + ss.getId());
  } finally {
    lock.releaseLock();
  }
}

// F6: hanya buat spreadsheet BARU jika belum ada ID sama sekali.
// Jika ID sudah ada tapi gagal dibuka (salah ID / tidak ada akses) -> LEMPAR ERROR,
// jangan bikin DB kosong yang membuat data "seolah hilang".
function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var storedId = props.getProperty('SPREADSHEET_ID');
  var finalId = storedId || getConfig_('SPREADSHEET_ID', SPREADSHEET_ID);
  if (finalId) {
    try {
      return SpreadsheetApp.openById(finalId);
    } catch (e) {
      throw new Error('SPREADSHEET_ID tidak bisa dibuka: ' + finalId + '. Cek ID/sharing. Dibatalkan (tidak membuat DB baru demi keamanan data).');
    }
  }
  var newSs = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty('SPREADSHEET_ID', newSs.getId());
  Logger.log('Spreadsheet baru dibuat (fresh install): ' + newSs.getId());
  return newSs;
}

function initializeSheets_(ss) {
  var sheetNames = Object.keys(SHEETS).map(function(k) { return SHEETS[k]; });
  sheetNames.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    var headers = HEADERS[sheetName];
    if (!headers) return;
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (existingHeaders.join('|') !== headers.join('|')) {
        Logger.log('⚠️ Header sheet ' + sheetName + ' tidak sesuai config. Diperbaiki. (Lama: ' + existingHeaders.join(',') + ')');
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
    }
  });
}

function seedInitialData_(ss) {
  var seedFunctions = [
    seedPermissions_,
    seedApplications_,
    function() {
      var adminRoleId = seedAdminRole_();
      seedRolePermissions_(adminRoleId);
      seedAdminUser_(adminRoleId);
    },
    seedDefaultSettings_,
    seedFolders_,
    seedNotificationChannels_,
    seedNotificationTemplates_
  ];
  seedFunctions.forEach(function(fn) {
    try { fn(); } catch (e) { Logger.log('⚠️ Peringatan seed (' + (fn.name || 'anonymous') + '): ' + e.message); }
  });
}

function seedPermissions_() {
  var existingPerms = readAll_(SHEETS.PERMISSIONS);
  var permSheet = getSheet_(SHEETS.PERMISSIONS);
  INITIAL_PERMISSIONS.forEach(function(perm) {
    if (!existingPerms.some(function(p) { return p.code === perm.code; })) {
      permSheet.appendRow([getNextId_(SHEETS.PERMISSIONS), perm.resource, perm.action, perm.code, perm.description]);
    }
  });
  invalidateCache_(SHEETS.PERMISSIONS);
}

// F5: insert jika belum ada; UPDATE redirect_uri jika URL kode berubah (dengan log keras).
function seedApplications_() {
  var existingApps = readAll_(SHEETS.APPLICATIONS);
  REGISTERED_APPS.forEach(function(app) {
    var found = null;
    for (var i = 0; i < existingApps.length; i++) {
      if (String(existingApps[i].code) === String(app.code)) { found = existingApps[i]; break; }
    }
    var now = new Date().toISOString();
    if (!found) {
      appendRow_(SHEETS.APPLICATIONS, {
        id: getNextId_(SHEETS.APPLICATIONS), code: app.code, name: app.name,
        client_type: 'web', status: 'active', description: app.description || '',
        redirect_uri: app.url || '', icon_url: '', created_at: now, updated_at: now
      });
      Logger.log('✅ Aplikasi "' + app.name + '" ditambahkan ke sheet applications.');
    } else if (String(found.redirect_uri || '') !== String(app.url || '')) {
      updateRow_(SHEETS.APPLICATIONS, found.id, { redirect_uri: app.url || '', updated_at: now });
      Logger.log('🔄 URL "' + app.code + '" diperbarui.\n   Lama: ' + found.redirect_uri + '\n   Baru: ' + app.url);
    }
  });
}

function seedApplications() { return seedApplications_(); }

/**
 * Jalankan fungsi ini 1x di SI-PLATFORM Editor untuk membersihkan karakter '++'
 * dan menyinkronkan seluruh URL aplikasi resmi langsung ke Sheet 'applications'.
 */
function cleanAndSyncApplications() {
  var appsData = [
    { code: 'SIMPEG', name: 'Manajemen Kepegawaian', description: 'Sistem Informasi Manajemen Pegawai', url: 'https://script.google.com/macros/s/AKfycbxCpBB4HtAIfKoLDKT5pKev8Xl9KhMjXPfcnSceeOo5r_tgudNXZOSb_q1inOG8tmQ/exec', icon: 'fa-solid fa-users' },
    { code: 'SIKOMPETENSI', name: 'SI-KOMPETENSI', description: 'Manajemen pengembangan kompetensi pegawai', url: 'https://script.google.com/macros/s/AKfycbzBy8WWtMeTh2QfihQJ0yjhSlBFFgdOOY6ZFV2S_RDCO0MXpaPEY1sUqqgdO34iWQAQ/exec', icon: 'fa-solid fa-graduation-cap' },
    { code: 'SILAHAR', name: 'SI-LAPORAN-HARIAN', description: 'Laporan harian pegawai', url: 'https://script.google.com/macros/s/AKfycbyjssIwRcvLAlXg_lqbNYqVSTP2kROejlBIOHKQMTyGq1OOZsHicupxQzZQW8W89wcy/exec', icon: 'fa-solid fa-file-lines' },
    { code: 'SIPENGAWASAN', name: 'SI-PENGAWASAN', description: 'Pengawasan internal', url: 'https://script.google.com/macros/s/AKfycbwlPueLcyijm5SOagXXfpGronGuCl1solPi5yqVjqrKS4ivd3EzxMq_psn2yG66UaWheA/exec', icon: 'fa-solid fa-shield-halved' },
    { code: 'SIPELAPORAN', name: 'SI-PELAPORAN', description: 'Sistem informasi pelaporan pegawai', url: 'https://script.google.com/macros/s/AKfycbxoK5-cANH_yzX3WC1MyinwJztYoed0jp3oERGJ8LOfpALO6ITmet-ubQ-xiBloSjqU0g/exec', icon: 'fa-solid fa-file-signature' },
    { code: 'SIUJI', name: 'SI-UJI KONEKSI', description: 'Aplikasi uji integrasi dan koneksi', url: 'https://script.google.com/macros/s/AKfycbx0j0JC-2GCwLjCrFB8yCklztC5_19EqqLJZw4b_fRhho1bAQXfyS82SlHDuVPfnzbQ/exec', icon: 'fa-solid fa-plug' }
  ];

  var sheet = getSheet_(SHEETS.APPLICATIONS);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('Sheet applications kosong, menjalankan seed...');
    seedApplications_();
    return;
  }

  var headers = data[0];
  var colCode = headers.indexOf('code');
  var colUri = headers.indexOf('redirect_uri');
  var colUpdated = headers.indexOf('updated_at');

  var updatedCount = 0;
  for (var i = 1; i < data.length; i++) {
    var code = String(data[i][colCode] || '').trim();
    var currentUri = String(data[i][colUri] || '');
    
    // 1. Bersihkan tanda '++' atau spasi liar
    var cleanedUri = currentUri.replace(/^[+\s]+|[+\s]+$/g, '').trim();

    // 2. Cocokkan dengan daftar URL resmi jika ada
    var match = null;
    for (var m = 0; m < appsData.length; m++) {
      if (appsData[m].code === code) { match = appsData[m]; break; }
    }
    if (match && match.url) {
      cleanedUri = match.url.trim();
    }

    if (cleanedUri !== currentUri) {
      sheet.getRange(i + 1, colUri + 1).setValue(cleanedUri);
      if (colUpdated !== -1) sheet.getRange(i + 1, colUpdated + 1).setValue(new Date().toISOString());
      Logger.log('✅ [' + code + '] URL diperbarui dan dibersihkan:\n   -> ' + cleanedUri);
      updatedCount++;
    }
  }

  invalidateCache_(SHEETS.APPLICATIONS);
  Logger.log('==========================================================');
  Logger.log('🎉 Pembersihan Selesai! Total ' + updatedCount + ' URL aplikasi diperbarui/dibersihkan.');
  Logger.log('==========================================================');
}

// Sinkron 1 URL aplikasi dari kode ke Sheet tanpa setup penuh. Contoh: syncAppUrlFromCode('SIUJI')
function syncAppUrlFromCode(appCode) { return syncAppUrlFromCode_(appCode); }
function syncAppUrlFromCode_(appCode) {
  var found = null;
  for (var i = 0; i < REGISTERED_APPS.length; i++) {
    if (String(REGISTERED_APPS[i].code) === String(appCode)) { found = REGISTERED_APPS[i]; break; }
  }
  if (!found) throw new Error('Kode ' + appCode + ' tidak ada di REGISTERED_APPS.');
  var row = findRow_(SHEETS.APPLICATIONS, 'code', appCode);
  if (!row) throw new Error('Kode ' + appCode + ' belum ada di Sheet applications. Jalankan setup() dulu.');
  updateRow_(SHEETS.APPLICATIONS, row.id, { redirect_uri: found.url || '', updated_at: new Date().toISOString() });
  Logger.log('🔄 URL "' + appCode + '" disinkron dari kode: ' + found.url);
  return true;
}

function seedAdminRole_() {
  var roles = readAll_(SHEETS.ROLES);
  var adminRole = null;
  for (var i = 0; i < roles.length; i++) { if (roles[i].code === 'admin') { adminRole = roles[i]; break; } }
  if (adminRole) return adminRole.id;
  var id = getNextId_(SHEETS.ROLES);
  var now = new Date().toISOString();
  getSheet_(SHEETS.ROLES).appendRow([id, 'admin', 'Administrator', 'global', 'active', now, now]);
  invalidateCache_(SHEETS.ROLES);
  return id;
}

function seedRolePermissions_(adminRoleId) {
  var permissions = readAll_(SHEETS.PERMISSIONS);
  var existingRolePerms = readAll_(SHEETS.ROLE_PERMISSIONS);
  var rolePermSheet = getSheet_(SHEETS.ROLE_PERMISSIONS);
  var added = 0;
  permissions.forEach(function(perm) {
    var exists = existingRolePerms.some(function(rp) {
      return String(rp.role_id) === String(adminRoleId) && String(rp.permission_id) === String(perm.id);
    });
    if (!exists) { rolePermSheet.appendRow([adminRoleId, perm.id]); added++; }
  });
  if (added) invalidateCache_(SHEETS.ROLE_PERMISSIONS);
}

function seedAdminUser_(adminRoleId) {
  var adminEmail = getConfig_('DEFAULT_ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL);
  if (!adminEmail || !isValidEmail_(adminEmail)) {
    try { adminEmail = Session.getActiveUser().getEmail(); } catch (e) { adminEmail = ''; }
    if (!adminEmail || !isValidEmail_(adminEmail)) adminEmail = 'admin@trenggalekkab.go.id';
  }
  var users = readAll_(SHEETS.USERS);
  for (var i = 0; i < users.length; i++) { if (users[i].email === adminEmail) return; }
  var userId = getNextId_(SHEETS.USERS);
  var now = new Date().toISOString();
  var salt = generateSalt_();
  getSheet_(SHEETS.USERS).appendRow([userId, 'admin', adminEmail, 'Administrator', 'active', '', '', '', now, now, hashPassword_('admin123', salt), salt]);
  getSheet_(SHEETS.USER_ROLES).appendRow([userId, adminRoleId, now, 'system']);
  invalidateCache_(SHEETS.USERS);
  invalidateCache_(SHEETS.USER_ROLES);
  Logger.log('⚠️ User admin dibuat dengan password default "admin123". SEGERA GANTI setelah login pertama.');
}

function seedDefaultSettings_() {
  var settings = readAll_(SHEETS.SETTINGS);
  if (settings.length > 0) return;
  var settingSheet = getSheet_(SHEETS.SETTINGS);
  var now = new Date().toISOString();
  [
    { key: 'org_name', value: 'Pemerintah Kabupaten Trenggalek' },
    { key: 'app_timezone', value: 'Asia/Jakarta' },
    { key: 'app_theme', value: 'default' },
    { key: 'app_logo_url', value: '' },
    { key: 'schema_version', value: String(SCHEMA_VERSION) }
  ].forEach(function(s) {
    settingSheet.appendRow([getNextId_(SHEETS.SETTINGS), s.key, JSON.stringify(s.value), 'global', '', 1, 'system', now]);
  });
  invalidateCache_(SHEETS.SETTINGS);
}

// F8: ID berurutan (nid, nid+1, ...) — sebelumnya 4x panggil max+1 sebelum append = kembar.
function seedFolders_() {
  if (readAll_(SHEETS.FOLDERS).length > 0) return;
  var folderSheet = getSheet_(SHEETS.FOLDERS);
  var now = new Date().toISOString();
  [DRIVE_ROOT_FOLDER_ID, DRIVE_USERS_FOLDER_ID, DRIVE_APPLICATIONS_FOLDER_ID, DRIVE_TEMP_FOLDER_ID].forEach(function(id) {
    if (!id) return;
    try { DriveApp.getFolderById(id); } catch (e) { Logger.log('⚠️ Folder Drive ID "' + id + '" belum dapat diakses: ' + e.message); }
  });
  var nid = getNextId_(SHEETS.FOLDERS);
  var rows = [
    [nid, 'SI-FILE-STORAGE', '', 'system', DRIVE_ROOT_FOLDER_ID || '', now, now],
    [nid + 1, 'Users', '', 'system', DRIVE_USERS_FOLDER_ID || '', now, now],
    [nid + 2, 'Applications', '', 'system', DRIVE_APPLICATIONS_FOLDER_ID || '', now, now],
    [nid + 3, 'Temp', '', 'system', DRIVE_TEMP_FOLDER_ID || '', now, now]
  ];
  rows[1][2] = nid; rows[2][2] = nid; rows[3][2] = nid;
  rows.forEach(function(row) { folderSheet.appendRow(row); });
  invalidateCache_(SHEETS.FOLDERS);
}

function seedNotificationChannels_() {
  if (readAll_(SHEETS.NOTIFICATION_CHANNELS).length > 0) return;
  var sheet = getSheet_(SHEETS.NOTIFICATION_CHANNELS);
  var now = new Date().toISOString();
  var nid = getNextId_(SHEETS.NOTIFICATION_CHANNELS); // F8
  [[nid, 'email', 'gmail', '{}', 'active', now],
   [nid + 1, 'whatsapp', 'external_api', '{}', 'inactive', now],
   [nid + 2, 'push', 'google_chat', '{}', 'inactive', now]
  ].forEach(function(row) { sheet.appendRow(row); });
  invalidateCache_(SHEETS.NOTIFICATION_CHANNELS);
}

function seedNotificationTemplates_() {
  if (readAll_(SHEETS.NOTIFICATION_TEMPLATES).length > 0) return;
  var sheet = getSheet_(SHEETS.NOTIFICATION_TEMPLATES);
  var now = new Date().toISOString();
  sheet.appendRow([getNextId_(SHEETS.NOTIFICATION_TEMPLATES), 'welcome_email', 'Email Selamat Datang', 'email', 'Selamat Datang di SI Platform', 'Halo {{name}}, akun Anda telah dibuat.', 'name,email', true, now, now]);
  invalidateCache_(SHEETS.NOTIFICATION_TEMPLATES);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function setupNotificationTrigger_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'processNotificationQueue_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('processNotificationQueue_').timeBased().everyMinutes(5).create();
    Logger.log('Trigger notifikasi terpasang (setiap 5 menit).');
  } catch (e) { Logger.log('⚠️ Gagal memasang trigger notifikasi: ' + e.message); }
}

function setupBackupTrigger_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'backupSpreadsheet_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('backupSpreadsheet_').timeBased().everyDays(1).atHour(2).create();
    Logger.log('Trigger backup harian terpasang (jam 2 pagi).');
  } catch (e) { Logger.log('⚠️ Gagal memasang trigger backup: ' + e.message); }
}

function setupErrorRateTrigger_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'checkErrorRate_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('checkErrorRate_').timeBased().everyDays(1).atHour(3).create();
    Logger.log('Trigger pemantauan error rate terpasang (jam 3 pagi).');
  } catch (e) { Logger.log('⚠️ Gagal memasang trigger pemantauan error rate: ' + e.message); }
}

// F10c: BARU — membersihkan session kedaluwarsa tiap hari jam 4 pagi.
function setupSessionCleanupTrigger_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'cleanupExpiredSessions_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('cleanupExpiredSessions_').timeBased().everyDays(1).atHour(4).create();
    Logger.log('Trigger bersih-bersih session terpasang (jam 4 pagi).');
  } catch (e) { Logger.log('⚠️ Gagal memasang trigger bersih session: ' + e.message); }
}

function migrate_() {
  var settingSheet = getSheet_(SHEETS.SETTINGS);
  var settings = readAll_(SHEETS.SETTINGS);
  var schemaVersionSetting = null;
  for (var i = 0; i < settings.length; i++) { if (settings[i].key === 'schema_version') { schemaVersionSetting = settings[i]; break; } }
  var currentVersion = 0;
  if (schemaVersionSetting) { try { currentVersion = Number(JSON.parse(schemaVersionSetting.value_json)) || 0; } catch (e) { currentVersion = 0; } }
  if (currentVersion < SCHEMA_VERSION) {
    Logger.log('Migrasi skema ' + currentVersion + ' -> ' + SCHEMA_VERSION + '...');
    if (!schemaVersionSetting) {
      settingSheet.appendRow([getNextId_(SHEETS.SETTINGS), 'schema_version', JSON.stringify(String(SCHEMA_VERSION)), 'global', '', 1, 'system', new Date().toISOString()]);
    } else {
      updateRow_(SHEETS.SETTINGS, schemaVersionSetting.id, { value_json: JSON.stringify(String(SCHEMA_VERSION)), updated_at: new Date().toISOString() });
    }
    invalidateCache_(SHEETS.SETTINGS);
    Logger.log('Migrasi selesai.');
  } else {
    Logger.log('Schema sudah versi terbaru: ' + currentVersion);
  }
}

function backupSpreadsheet_() {
  try {
    var ss = getOrCreateSpreadsheet_();
    var backupFolderId = getConfig_('DRIVE_BACKUP_FOLDER_ID', null);
    if (!backupFolderId) { Logger.log('⚠️ Backup gagal: DRIVE_BACKUP_FOLDER_ID belum dikonfigurasi.'); return; }
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
    var copy = ss.copy('Backup SI-Platform ' + stamp);
    var file = DriveApp.getFileById(copy.getId());
    DriveApp.getFolderById(backupFolderId).addFile(file);
    DriveApp.getRootFolder().removeFile(file); // jangan menumpuk di root Drive
    Logger.log('✅ Backup berhasil. File ID: ' + file.getId());
  } catch (e) { Logger.log('❌ Backup gagal: ' + e.message); }
}

function checkErrorRate_() {
  try {
    var events = readAll_(SHEETS.AUDIT_EVENTS);
    if (events.length > 5000) events = events.slice(events.length - 5000); // batasi agar trigger tidak timeout
    var since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    var recent = events.filter(function(e) { try { return new Date(e.timestamp) >= since; } catch (err) { return false; } });
    if (recent.length === 0) return;
    var errors = recent.filter(function(e) { return e.result === 'FAILED' || e.action === 'handler.error' || e.action === 'api.error'; });
    var errorRate = (errors.length / recent.length) * 100;
    if (errorRate > 5) {
      var adminEmail = getConfig_('DEFAULT_ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL);
      MailApp.sendEmail(adminEmail, 'Peringatan: Error Rate SI-Platform Tinggi',
        'Error rate 24 jam terakhir: ' + errorRate.toFixed(2) + '%\nTotal event: ' + recent.length + ', Error: ' + errors.length + '.\nMohon periksa dashboard atau log.');
      Logger.log('Email peringatan error rate terkirim ke ' + adminEmail);
    } else {
      Logger.log('Error rate normal: ' + errorRate.toFixed(2) + '%');
    }
  } catch (e) { Logger.log('⚠️ Gagal memeriksa error rate: ' + e.message); }
}

function syncRolePermissions() { return syncRolePermissions_(); }

// PERBAIKAN: lock + tulis sekaligus + PERTAHANKAN role custom (kasat/kabid/dll) yang tak ada di mapping.
function syncRolePermissions_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var allRoles = readAll_(SHEETS.ROLES);
    var allPermissions = readAll_(SHEETS.PERMISSIONS);
    var mapping = {
      'admin': allPermissions.map(function(p) { return p.code; }),
      'viewer': ['dashboard.read', 'audit.read', 'user.read', 'file.read', 'notification.read', 'application.read', 'setting.read', 'permission.read', 'role.read'],
      'operator': ['user.read', 'user.create', 'user.update', 'file.read', 'file.upload', 'file.download', 'notification.read', 'notification.send', 'dashboard.read', 'application.read', 'audit.read'],
      'kepala_dinas': ['dashboard.read', 'audit.read', 'setting.read', 'file.read', 'notification.read', 'application.read', 'user.read'],
      'sekretaris': ['user.read', 'user.create', 'user.update', 'file.read', 'file.upload', 'file.download', 'notification.read', 'notification.send', 'dashboard.read', 'application.read', 'setting.read'],
      'bendahara': ['dashboard.read', 'audit.read', 'file.read', 'file.upload', 'file.download', 'setting.read', 'notification.read'],
      'auditor': ['audit.read', 'audit.export', 'dashboard.read', 'file.read', 'user.read', 'role.read', 'permission.read'],
      'helpdesk': ['user.read', 'user.update', 'notification.read', 'notification.send', 'dashboard.read', 'application.read', 'file.read'],
      'user': ['dashboard.read', 'application.read', 'file.read', 'file.download', 'notification.read'],
      'guest': []
    };
    var permIdByCode = {};
    allPermissions.forEach(function(p) { permIdByCode[p.code] = p.id; });
    var roleById = {};
    allRoles.forEach(function(r) { roleById[String(r.id)] = r; });
    // Pertahankan relasi milik role yang TIDAK ada di mapping (role custom daerah).
    var kept = readAll_(SHEETS.ROLE_PERMISSIONS).filter(function(rp) {
      var r = roleById[String(rp.role_id)];
      return !r || !mapping[r.code];
    });
    var newRows = [HEADERS[SHEETS.ROLE_PERMISSIONS]];
    kept.forEach(function(rp) { newRows.push([rp.role_id, rp.permission_id]); });
    var inserted = 0;
    allRoles.forEach(function(role) {
      var permCodes = mapping[role.code];
      if (!permCodes) { Logger.log('⏭️ Role "' + role.code + '" dipertahankan apa adanya (tidak ada di mapping).'); return; }
      permCodes.forEach(function(code) {
        if (permIdByCode[code] === undefined) return;
        newRows.push([role.id, permIdByCode[code]]);
        inserted++;
      });
    });
    var sheet = getSheet_(SHEETS.ROLE_PERMISSIONS);
    sheet.clearContents();
    sheet.getRange(1, 1, newRows.length, HEADERS[SHEETS.ROLE_PERMISSIONS].length).setValues(newRows);
    invalidateCache_(SHEETS.ROLE_PERMISSIONS);
    Logger.log('Sinkronisasi selesai. Dipertahankan: ' + kept.length + ', ditulis ulang: ' + inserted);
    return inserted;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function syncUserRoles() { return syncUserRoles_(); }

function syncUserRoles_() {
  var users = readAll_(SHEETS.USERS);
  var roles = readAll_(SHEETS.ROLES);
  var existingUserRoles = readAll_(SHEETS.USER_ROLES);
  var roleByCode = {};
  roles.forEach(function(r) { roleByCode[r.code] = r; });
  var defaultRole = roleByCode['user'];
  var operatorRole = roleByCode['operator'];
  var adminRole = roleByCode['admin'];
  if (!adminRole) { Logger.log('❌ Role admin belum ada. Jalankan setup() dulu.'); return 0; }
  if (!defaultRole) Logger.log('⚠️ Role "user" belum ada — user baru tanpa mapping khusus akan dilewati. Buat role "user" dulu.');
  // ===== SESUAIKAN SAAT MUTASI (lebih baik pindah ke Sheet master jabatan) =====
  var specialMapping = [
    { keyword: 'PURWO EDI PRAWITO', role: roleByCode['kepala_dinas'] },
    { keyword: 'AHMAD SAMSURI', role: roleByCode['sekretaris'] },
    { keyword: 'TUGAS RULATNO', role: roleByCode['bendahara'] },
    { keyword: 'WASIS WIDODO', role: roleByCode['auditor'] }
  ];
  // ============================================================================
  var newRows = [];
  var skippedNoRole = 0;
  users.forEach(function(user) {
    if (String(user.username).toLowerCase() === 'admin') {
      var hasAdmin = existingUserRoles.some(function(ur) { return String(ur.user_id) === String(user.id) && String(ur.role_id) === String(adminRole.id); });
      if (!hasAdmin) newRows.push([user.id, adminRole.id, new Date().toISOString(), 'system']);
      return;
    }
    var alreadyHas = existingUserRoles.some(function(ur) { return String(ur.user_id) === String(user.id); });
    if (alreadyHas) return;
    var assignedRole = defaultRole || null;
    var displayName = String(user.display_name || '').toUpperCase();
    for (var i = 0; i < specialMapping.length; i++) {
      if (displayName.indexOf(specialMapping[i].keyword) !== -1) { assignedRole = specialMapping[i].role || assignedRole; break; }
    }
    if (String(user.username).toLowerCase() === 'polpptrenggalek' && operatorRole) assignedRole = operatorRole;
    if (!assignedRole) { skippedNoRole++; return; }
    newRows.push([user.id, assignedRole.id, new Date().toISOString(), 'system']);
  });
  if (newRows.length > 0) {
    var sheet = getSheet_(SHEETS.USER_ROLES);
    newRows.forEach(function(row) { sheet.appendRow(row); });
    invalidateCache_(SHEETS.USER_ROLES);
  }
  Logger.log('Sinkronisasi user_roles selesai. Baru: ' + newRows.length + ', dilewati (role belum ada): ' + skippedNoRole);
  return newRows.length;
}

/**
 * Alias setupApp() untuk kompatibilitas ekosistem
 */
function setupApp() {
  return setup();
}
