// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 5: TEST SUITE ====================
// Changelog v2:
// - T3: URL platform dari Properties -> ScriptApp.getService().getUrl(). TANPA hardcode.
// - T2: cekTiket() baca dari Sheet (cache tiket memang tidak pernah ditulis).
// - T4: cleanup relasi pakai hapus-baris-fisik (user_roles & role_permissions tak punya kolom id).
// - T6: testNotification pakai email + tes negatif whatsapp.
// - T1: tes HTTP baru — testHttpTicketFlow_ (regresi F1+F3) & testHttpEnvelope_ (regresi F2).
// - T5: SIKINERJA dipertahankan sbg wrapper + warning (kode terdaftar: SIKOMPETENSI).
// Cara pakai: 1) paste 5 file -> Save, 2) Run setup() sekali, 3) Deploy,
// 4) Run simpanUrlPlatformManual(".../exec") dengan URL dari Manage deployments,
// 5) Run runAllTests().

// ==================== URL PLATFORM (SATU SUMBER, TANPA HARDCODE) ====================
function getPlatformUrl_() {
  var saved = PropertiesService.getScriptProperties().getProperty('PLATFORM_API_URL');
  if (saved) return saved;
  try { var auto = ScriptApp.getService().getUrl(); if (auto) return auto; } catch (e) {}
  return '';
}

function simpanUrlPlatformSekarang() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  if (!url) {
    Logger.log('URL otomatis tidak tersedia (project belum di-Deploy sebagai Web App?). Deploy dulu, lalu jalankan lagi. Atau set manual via Properties PLATFORM_API_URL.');
    return { success: false, message: 'Belum deploy.' };
  }
  PropertiesService.getScriptProperties().setProperty('PLATFORM_API_URL', url);
  Logger.log('URL platform disimpan: ' + url);
  return { success: true, message: 'URL platform disimpan.' };
}

function cekUrlPlatform() {
  Logger.log('PLATFORM_API_URL = ' + getPlatformUrl_());
}

// ==================== TIKET UJI ====================
function createTestTicket_(appCode) {
  var admin = findRow_(SHEETS.USERS, 'email', DEFAULT_ADMIN_EMAIL);
  if (!admin) throw new Error('Admin tidak ditemukan. Pastikan setup sudah dijalankan.');
  var result = createAccessTicket_(admin.id, appCode, { user: admin });
  if (!result || !result.ticket) throw new Error('Gagal membuat tiket untuk ' + appCode);
  Logger.log('Tiket untuk ' + appCode + ': ' + result.ticket);
  return result.ticket;
}

function createTestTicketSIMPEG() { return createTestTicket_('SIMPEG'); }
function createTestTicketSIKINERJA() {
  Logger.log('⚠️ Kode terdaftar adalah SIKOMPETENSI. SIKINERJA hanya untuk uji tiket generik.');
  return createTestTicket_('SIKINERJA');
}
function createTestTicketSIUJI() { return createTestTicket_('SIUJI'); }
function createTestTicketSIPENGAWASAN() { return createTestTicket_('SIPENGAWASAN'); }
function createTestTicketSILAHAR() { return createTestTicket_('SILAHAR'); }

// T2: cek tiket via SHEET (bukan cache — cache tiket tidak pernah ditulis sistem).
function cekTiket(ticket) {
  if (!ticket || typeof ticket !== 'string') {
    Logger.log('Contoh: cekTiket("t_...") — buat dulu via createTestTicketSIUJI()');
    return null;
  }
  var sheet = getSheet_(SHEETS.TICKETS);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var ti = headers.indexOf('ticket');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ti]) === ticket) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
      var valid = false;
      try { valid = new Date(obj.expires_at) >= new Date(); } catch (e) {}
      Logger.log('Tiket ditemukan: app=' + obj.app_code + ', user_id=' + obj.user_id + ', expires=' + obj.expires_at + ', masih_berlaku=' + valid);
      return obj;
    }
  }
  Logger.log('Tiket tidak ditemukan di sheet TICKETS.');
  return null;
}

// ==================== HTTP HELPER + UJI HTTP ====================
function httpPost_(url, obj) {
  var resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(obj), muteHttpExceptions: true, followRedirects: true });
  return { code: resp.getResponseCode(), json: JSON.parse(resp.getContentText()) };
}

function testDirectValidateTicket() {
  var admin = findRow_(SHEETS.USERS, 'email', DEFAULT_ADMIN_EMAIL);
  if (!admin) { Logger.log('Error: Admin tidak ditemukan.'); return; }
  var ticket = createAccessTicket_(admin.id, 'SIUJI', { user: admin }).ticket;
  Logger.log('1. Tiket dibuat: ' + ticket);
  var execUrl = getPlatformUrl_();
  if (!execUrl) { Logger.log('Error: URL platform kosong. Jalankan simpanUrlPlatformSekarang() setelah Deploy.'); return; }
  Logger.log('2. Menguji: ' + execUrl);
  try {
    var r = httpPost_(execUrl, { method: 'POST', path: '/api/v1/auth/validate-ticket', data: { ticket: ticket } });
    Logger.log('3. HTTP ' + r.code + '\n4. Body:\n' + JSON.stringify(r.json).slice(0, 1000));
    if (r.code === 200 && r.json.success) Logger.log('✅ TEST BERHASIL. Roles: ' + JSON.stringify((r.json.data.user || {}).roles));
    else Logger.log('❌ TEST GAGAL: ' + ((r.json.error || {}).message || 'unknown'));
  } catch (error) { Logger.log('❌ TEST GAGAL (UrlFetchApp): ' + error.message); }
}

function testDirectValidateTicketForApp(appCode) {
  var admin = findRow_(SHEETS.USERS, 'email', DEFAULT_ADMIN_EMAIL);
  if (!admin) { Logger.log('Error: Admin tidak ditemukan.'); return; }
  var ticket = createAccessTicket_(admin.id, appCode, { user: admin }).ticket;
  Logger.log('1. Tiket untuk ' + appCode + ': ' + ticket);
  var execUrl = getPlatformUrl_();
  if (!execUrl) { Logger.log('Error: URL platform kosong. Jalankan simpanUrlPlatformSekarang().'); return; }
  try {
    var r = httpPost_(execUrl, { method: 'POST', path: '/api/v1/auth/validate-ticket', data: { ticket: ticket } });
    Logger.log('2. HTTP ' + r.code + '\n3. Body:\n' + JSON.stringify(r.json).slice(0, 1000));
    if (r.code === 200 && r.json.success) Logger.log('✅ BERHASIL. Roles: ' + JSON.stringify((r.json.data.user || {}).roles));
    else Logger.log('❌ GAGAL: ' + ((r.json.error || {}).message || 'unknown'));
  } catch (error) { Logger.log('❌ GAGAL (UrlFetchApp): ' + error.message); }
}

function testDirectValidateTicketSIPENGAWASAN() { testDirectValidateTicketForApp('SIPENGAWASAN'); }
function testDirectValidateTicketSILAHAR() { testDirectValidateTicketForApp('SILAHAR'); }

// ==================== RUNNER + ASSERT ====================
function runAllTests() {
  console.log('=== MULAI TEST ===');
  try {
    testSetup();
    testAuth();
    testUserManagement();
    testRoleManagement();
    testAudit();
    testFileStorage();
    testNotification();
    testSortingServerSide();
    testUploadSizeLimit();
    testAuthorizationNegative();
    testHealthCheck_();
    testSettingUpdateAndHistory_();
    testFileUploadMimeValidation_();
    testFileUploadSanitization_();
    testUserDeactivationRevokesSessions_();
    testTicketCreationValidation_();
    testListRegisteredApps_();
    testTicketForSIPENGAWASAN();
    testTicketForSILAHAR();
    testHttpTicketFlow_(); // T1: regresi F1+F3 via HTTP
    testHttpEnvelope_();   // T1: regresi F2 via HTTP
    console.log('=== SEMUA TEST SELESAI ===');
  } catch (e) { console.error('TEST GAGAL: ' + e.message); }
}

function assert_(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

function assertThrows_(fn, snippet, message) {
  var thrown = false;
  try { fn(); } catch (e) {
    thrown = true;
    if (snippet && String(e.message).indexOf(snippet) === -1) throw new Error('ASSERTION FAILED: ' + message + ' (pesan: ' + e.message + ')');
  }
  if (!thrown) throw new Error('ASSERTION FAILED: ' + message + ' (tidak ada error)');
}

// ==================== CLEANUP HELPERS (T4) ====================
// user_roles & role_permissions TIDAK punya kolom id -> hapus baris fisik by posisi.
function deleteUserRoleRow_(userId, roleId) {
  var sheet = getSheet_(SHEETS.USER_ROLES);
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(userId) && String(data[i][1]) === String(roleId)) { sheet.deleteRow(i + 1); invalidateCache_(SHEETS.USER_ROLES); return true; }
  }
  return false;
}

function deleteRolePermRow_(roleId, permId) {
  var sheet = getSheet_(SHEETS.ROLE_PERMISSIONS);
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(roleId) && String(data[i][1]) === String(permId)) { sheet.deleteRow(i + 1); invalidateCache_(SHEETS.ROLE_PERMISSIONS); return true; }
  }
  return false;
}

function cleanupUser_(userId) {
  findAll_(SHEETS.USER_ROLES, { user_id: userId }).forEach(function(ur) { deleteUserRoleRow_(userId, ur.role_id); });
  deleteRow_(SHEETS.USERS, userId);
}

function cleanupRole_(roleId) {
  findAll_(SHEETS.ROLE_PERMISSIONS, { role_id: roleId }).forEach(function(rp) { deleteRolePermRow_(roleId, rp.permission_id); });
  deleteRow_(SHEETS.ROLES, roleId);
}

function cleanupFolder_(folderId, driveFolderId) {
  if (driveFolderId) { try { DriveApp.getFolderById(driveFolderId).setTrashed(true); } catch (e) { console.warn('Gagal hapus folder Drive: ' + e.message); } }
  deleteRow_(SHEETS.FOLDERS, folderId);
}

function cleanupFile_(fileId, storageKey) {
  if (storageKey) { try { DriveApp.getFileById(storageKey).setTrashed(true); } catch (e) { console.warn('Gagal hapus file Drive: ' + e.message); } }
  deleteRow_(SHEETS.FILES, fileId);
}

function cleanupSetting_(key) {
  var setting = findRow_(SHEETS.SETTINGS, 'key', key);
  if (!setting) return;
  findAll_(SHEETS.SETTING_VERSIONS, { setting_id: setting.id }).forEach(function(v) { deleteRow_(SHEETS.SETTING_VERSIONS, v.id); });
  findAll_(SHEETS.SETTING_CHANGE_LOGS, { setting_id: setting.id }).forEach(function(l) { deleteRow_(SHEETS.SETTING_CHANGE_LOGS, l.id); });
  deleteRow_(SHEETS.SETTINGS, setting.id);
}

function testAdmin_() {
  var admin = findRow_(SHEETS.USERS, 'email', DEFAULT_ADMIN_EMAIL);
  assert_(admin, 'Admin user ditemukan (' + DEFAULT_ADMIN_EMAIL + ').');
  return admin;
}

// ==================== TEST CASES ====================
function testSetup() {
  console.log('--- testSetup ---');
  assert_(readAll_(SHEETS.USERS).length >= 1, 'Minimal ada 1 user admin.');
  assert_(readAll_(SHEETS.ROLES).some(function(r) { return r.code === 'admin'; }), 'Role admin tersedia.');
  assert_(readAll_(SHEETS.PERMISSIONS).length >= INITIAL_PERMISSIONS.length, 'Semua permission awal tersedia.');
  console.log('PASS');
}

function testAuth() {
  console.log('--- testAuth ---');
  var admin = testAdmin_();
  var token = createSession_(admin.id, { ip: '127.0.0.1', user_agent: 'Test' });
  assert_(token, 'Token session dihasilkan.');
  var sessionUser = getUserByToken_(token);
  assert_(sessionUser && String(sessionUser.id) === String(admin.id), 'Session valid dan user benar.');
  logoutUser_({ token: token }, {});
  assert_(getUserByToken_(token) === null, 'Session tidak valid setelah logout.');
  console.log('PASS');
}

function testUserManagement() {
  console.log('--- testUserManagement ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var suffix = Utilities.getUuid();
  var created = createUser_({ username: 'test.user.' + suffix, email: 'test.user.' + suffix + '@example.com', display_name: 'Test User' }, context);
  assert_(created.id, 'User baru dibuat.');
  assert_(!created.password_hash && !created.password_salt, 'F1: hash tidak ikut di respons create.');
  try {
    var updated = updateUser_(created.id, { display_name: 'Test User Updated' }, context);
    assert_(updated.display_name === 'Test User Updated', 'Display name terupdate.');
    assert_(!updated.password_hash, 'F1: hash tidak ikut di respons update.');
    deleteUser_(created.id, context);
    assert_(findRow_(SHEETS.USERS, 'id', created.id).status === 'inactive', 'User dinonaktifkan.');
  } finally { cleanupUser_(created.id); }
  console.log('PASS');
}

function testRoleManagement() {
  console.log('--- testRoleManagement ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var role = createRole_({ code: 'viewer_' + Utilities.getUuid(), name: 'Viewer Test', scope: 'global' }, context);
  assert_(role.code.indexOf('viewer_') === 0, 'Role viewer dibuat.');
  try {
    var permRead = findRow_(SHEETS.PERMISSIONS, 'code', 'user.read');
    assignPermissionsToRole_(role.id, { permission_ids: [permRead.id] }, context);
    assert_(findAll_(SHEETS.ROLE_PERMISSIONS, { role_id: role.id, permission_id: permRead.id }).length === 1, 'Permission ter-assign.');
    removePermissionFromRole_(role.id, permRead.id, context);
    assert_(findAll_(SHEETS.ROLE_PERMISSIONS, { role_id: role.id, permission_id: permRead.id }).length === 0, 'Permission terhapus.');
  } finally { cleanupRole_(role.id); }
  console.log('PASS');
}

function testAudit() {
  console.log('--- testAudit ---');
  var admin = testAdmin_();
  var event = logAudit_({ actorId: admin.id, action: 'test.audit', resourceType: 'test', resourceId: '1', result: 'SUCCESS' });
  var found = findRow_(SHEETS.AUDIT_EVENTS, 'id', event.id);
  assert_(found && found.action === 'test.audit', 'Event audit tercatat.');
  deleteRow_(SHEETS.AUDIT_EVENTS, event.id);
  console.log('PASS');
}

function testFileStorage() {
  console.log('--- testFileStorage ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var newFolderId = null, newFolderDriveId = null, uploadedFileId = null, uploadedFileStorageKey = null;
  try {
    assert_(listFolders_({}, context).data.length >= 1, 'Folder awal tersedia.');
    var newFolder = createFolder_({ name: 'test_folder_' + Utilities.getUuid() }, context);
    newFolderId = newFolder.id; newFolderDriveId = newFolder.drive_folder_id;
    assert_(newFolder.id && newFolder.drive_folder_id, 'Folder baru dibuat.');
    var uploadedFile = uploadFile_({ file_name: 'test_file.txt', mime_type: 'text/plain', data_base64: Utilities.base64Encode('Ini adalah isi file test.'), folder_id: newFolder.id }, context);
    uploadedFileId = uploadedFile.id; uploadedFileStorageKey = uploadedFile.storage_key;
    assert_(uploadedFile.id && uploadedFile.storage_key, 'File terupload.');
    assert_(listFiles_({ folder_id: newFolder.id }, context).data.some(function(f) { return String(f.id) === String(uploadedFile.id); }), 'File ada di daftar.');
    var downloadResult = downloadFile_(uploadedFile.id, context);
    assert_(downloadResult.file_name === 'test_file.txt' && downloadResult.data_base64, 'Download OK.');
    deleteFile_(uploadedFile.id, context);
    var afterDelete = findRow_(SHEETS.FILES, 'id', uploadedFile.id);
    assert_(afterDelete.is_deleted === true || afterDelete.is_deleted === 'true', 'Soft delete OK.');
  } finally {
    if (uploadedFileId) cleanupFile_(uploadedFileId, uploadedFileStorageKey);
    if (newFolderId) cleanupFolder_(newFolderId, newFolderDriveId);
  }
  console.log('PASS');
}

// T6: jalur hijau pakai EMAIL; whatsapp wajib DITOLAK tahap 1.
function testNotification() {
  console.log('--- testNotification ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var notifId = null;
  try {
    assert_(listNotificationTemplates_({}, context).data.length >= 1, 'Minimal 1 template.');
    var notif = sendNotification_({ template_code: 'welcome_email', recipients: [{ type: 'email', value: 'test@example.com' }], channel: 'email', variables: { name: 'Test User' } }, context);
    notifId = notif.id;
    assert_(notif.id, 'Notifikasi tercatat.');
    assert_(findRow_(SHEETS.NOTIFICATIONS, 'id', notif.id).status === 'queued', 'Status awal queued.');
    assert_(listNotificationDeliveries_(notif.id, context).data.length >= 1, 'Delivery tercatat.');
    var detail = getNotificationDetail_(notif.id, context);
    assert_(detail.notification && detail.recipients && detail.deliveries, 'Detail tersedia.');
    assertThrows_(function() {
      sendNotification_({ recipients: [{ type: 'whatsapp', value: '6281234567890' }], channel: 'whatsapp', subject: 'x', body: 'y' }, context);
    }, 'belum aktif', 'Channel whatsapp ditolak tahap 1.');
  } finally {
    if (notifId) {
      findAll_(SHEETS.NOTIFICATION_RECIPIENTS, { notification_id: notifId }).forEach(function(r) { deleteRow_(SHEETS.NOTIFICATION_RECIPIENTS, r.id); });
      findAll_(SHEETS.NOTIFICATION_DELIVERIES, { notification_id: notifId }).forEach(function(d) { deleteRow_(SHEETS.NOTIFICATION_DELIVERIES, d.id); });
      deleteRow_(SHEETS.NOTIFICATIONS, notifId);
    }
  }
  console.log('PASS');
}

function testSortingServerSide() {
  console.log('--- testSortingServerSide ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var usersAsc = listUsers_({ page: 1, pageSize: 10, sortBy: 'username', sortOrder: 'asc' }, context);
  var usersDesc = listUsers_({ page: 1, pageSize: 10, sortBy: 'username', sortOrder: 'desc' }, context);
  assert_(usersAsc.data.length > 0 && usersDesc.data.length > 0, 'Data user tersedia.');
  if (usersAsc.data.length > 1 && usersDesc.data.length > 1) assert_(usersAsc.data[0].username !== usersDesc.data[0].username, 'Urutan asc/desc berbeda.');
  var filesAsc = listFiles_({ page: 1, pageSize: 10, sortBy: 'original_name', sortOrder: 'asc' }, context);
  var filesDesc = listFiles_({ page: 1, pageSize: 10, sortBy: 'original_name', sortOrder: 'desc' }, context);
  if (filesAsc.data.length > 1 && filesDesc.data.length > 1) assert_(filesAsc.data[0].original_name !== filesDesc.data[0].original_name, 'Urutan file asc/desc berbeda.');
  var auditAsc = listAuditEvents_({ page: 1, pageSize: 10, sortBy: 'timestamp', sortOrder: 'asc' }, context);
  var auditDesc = listAuditEvents_({ page: 1, pageSize: 10, sortBy: 'timestamp', sortOrder: 'desc' }, context);
  if (auditAsc.data.length > 1 && auditDesc.data.length > 1) {
    assert_(new Date(auditAsc.data[0].timestamp).getTime() <= new Date(auditAsc.data[1].timestamp).getTime(), 'Audit asc naik.');
    assert_(new Date(auditDesc.data[0].timestamp).getTime() >= new Date(auditDesc.data[1].timestamp).getTime(), 'Audit desc turun.');
  }
  console.log('PASS');
}

function testUploadSizeLimit() {
  console.log('--- testUploadSizeLimit ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var largeBase64 = 'A'.repeat(14 * 1024 * 1024);
  assertThrows_(function() {
    uploadFile_({ file_name: 'large_file.txt', mime_type: 'text/plain', data_base64: largeBase64, folder_id: null }, context);
  }, '10MB', 'Upload >10MB ditolak.');
  console.log('PASS');
}

function testAuthorizationNegative() {
  console.log('--- testAuthorizationNegative ---');
  var admin = testAdmin_();
  var suffix = Utilities.getUuid();
  var created = createUser_({ username: 'noperm_' + suffix, email: 'noperm.' + suffix + '@example.com', display_name: 'No Permission' }, { user: admin, token: null });
  var context = { user: created, token: null };
  try {
    assertThrows_(function() { listUsers_({}, context); }, 'FORBIDDEN', 'Tanpa permission ditolak (users).');
    assertThrows_(function() { getDashboardStats_(context); }, 'FORBIDDEN', 'Tanpa permission ditolak (dashboard).');
  } finally { cleanupUser_(created.id); }
  console.log('PASS');
}

function testHealthCheck_() {
  console.log('--- testHealthCheck_ ---');
  var result = healthCheck_();
  assert_(result.status === 'HEALTHY' || result.status === 'DEGRADED', 'Status valid.');
  assert_(result.checks && result.checks.spreadsheet && result.checks.drive && result.checks.notificationQueue, 'Semua komponen dicek.');
  assert_(!result.checks.spreadsheet.id, 'F10d: Spreadsheet ID tidak bocor di health publik.');
  console.log('PASS');
}

function testSettingUpdateAndHistory_() {
  console.log('--- testSettingUpdateAndHistory_ ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var testKey = 'test_setting_' + Utilities.getUuid();
  appendRow_(SHEETS.SETTINGS, { id: getNextId_(SHEETS.SETTINGS), key: testKey, value_json: JSON.stringify('initial_value'), scope_type: 'global', scope_id: '', version: 1, updated_by: 'system', updated_at: new Date().toISOString() });
  try {
    var oldSetting = findRow_(SHEETS.SETTINGS, 'key', testKey);
    assert_(oldSetting, 'Setting test dibuat.');
    var updated = updateSetting_(testKey, { value: 'updated_value' }, context);
    assert_(Number(updated.version) === Number(oldSetting.version) + 1, 'Versi bertambah.');
    assert_(JSON.parse(updated.value_json) === 'updated_value', 'Nilai berubah.');
    var history = getSettingHistory_(testKey, context);
    assert_(history.versions.length >= 1 && history.logs.length >= 1, 'Riwayat versi+log tersedia.');
  } finally { cleanupSetting_(testKey); }
  console.log('PASS');
}

function testFileUploadMimeValidation_() {
  console.log('--- testFileUploadMimeValidation_ ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  assertThrows_(function() {
    uploadFile_({ file_name: 'test.bin', mime_type: 'application/x-msdownload', data_base64: Utilities.base64Encode('x'), folder_id: null }, context);
  }, 'Tipe file tidak diizinkan', 'MIME terlarang ditolak.');
  console.log('PASS');
}

function testFileUploadSanitization_() {
  console.log('--- testFileUploadSanitization_ ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var newFileId = null, newFileStorageKey = null;
  try {
    var uploadedFile = uploadFile_({ file_name: '../secret_file.txt', mime_type: 'text/plain', data_base64: Utilities.base64Encode('x'), folder_id: null }, context);
    newFileId = uploadedFile.id; newFileStorageKey = uploadedFile.storage_key;
    assert_(uploadedFile.original_name !== '../secret_file.txt' && uploadedFile.original_name.indexOf('..') === -1, 'Nama file dibersihkan.');
  } finally { if (newFileId) cleanupFile_(newFileId, newFileStorageKey); }
  console.log('PASS');
}

function testUserDeactivationRevokesSessions_() {
  console.log('--- testUserDeactivationRevokesSessions_ ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var suffix = Utilities.getUuid();
  var created = createUser_({ username: 'revoke_' + suffix, email: 'revoke.' + suffix + '@example.com', display_name: 'Revoke Test' }, context);
  var token = createSession_(created.id);
  assert_(getUserByToken_(token) !== null, 'Sesi valid sebelum nonaktif.');
  try {
    deleteUser_(created.id, context);
    assert_(getUserByToken_(token) === null, 'Sesi mati setelah nonaktif.');
  } finally { deleteSession_(token); cleanupUser_(created.id); }
  console.log('PASS');
}

function testTicketCreationValidation_() {
  console.log('--- testTicketCreationValidation_ ---');
  var admin = testAdmin_();
  var context = { user: admin, token: null };
  var result = createAccessTicket_(admin.id, 'SIMPEG', context);
  assert_(result.ticket && result.expires_in > 0, 'Tiket dibuat.');
  var valid1 = validateAppTicket_(result.ticket);
  assert_(valid1 && valid1.user && String(valid1.user.id) === String(admin.id), 'Validasi pertama OK.');
  assert_(valid1.user.roles && valid1.user.roles.length >= 1, 'F3: roles tidak kosong.');
  assert_(!valid1.user.password_hash, 'F1: hash tidak bocor di tiket.');
  assert_(validateAppTicket_(result.ticket).user, 'Tiket reusable (by design 1 jam).');
  assertThrows_(function() { validateAppTicket_('tiket_palsu_123'); }, 'tidak valid', 'Tiket palsu ditolak.');
  console.log('PASS');
}

function testListRegisteredApps_() {
  console.log('--- testListRegisteredApps_ ---');
  var admin = testAdmin_();
  var result = listRegisteredApps_({}, { user: admin, token: null });
  assert_(Array.isArray(result.data) && result.data.length >= 1, 'Minimal 1 aplikasi.');
  console.log('PASS');
}

function testTicketForSIPENGAWASAN() {
  console.log('--- testTicketForSIPENGAWASAN ---');
  var admin = testAdmin_();
  var result = createAccessTicket_(admin.id, 'SIPENGAWASAN', { user: admin });
  assert_(result.ticket, 'Tiket dibuat.');
  assert_(validateAppTicket_(result.ticket).user, 'Tiket valid.');
  console.log('PASS');
}

function testTicketForSILAHAR() {
  console.log('--- testTicketForSILAHAR ---');
  var admin = testAdmin_();
  var result = createAccessTicket_(admin.id, 'SILAHAR', { user: admin });
  assert_(result.ticket, 'Tiket dibuat.');
  assert_(validateAppTicket_(result.ticket).user, 'Tiket valid.');
  console.log('PASS');
}

// T1 BARU: regresi F1+F3 lewat jalur HTTP asli (termasuk roles & anti-bocor).
function testHttpTicketFlow_() {
  console.log('--- testHttpTicketFlow_ ---');
  var url = getPlatformUrl_();
  if (!url) { console.log('SKIP: URL platform kosong. Deploy + simpanUrlPlatformSekarang() dulu.'); return; }
  var admin = testAdmin_();
  var t = createAccessTicket_(admin.id, 'SIUJI', { user: admin });
  var r = httpPost_(url, { method: 'POST', path: '/api/v1/auth/validate-ticket', data: { ticket: t.ticket } });
  assert_(r.code === 200 && r.json.success, 'Validate via HTTP sukses. Resp: ' + JSON.stringify(r.json).slice(0, 300));
  assert_(r.json.data && r.json.data.user && String(r.json.data.user.id) === String(admin.id), 'User sesuai.');
  assert_(r.json.data.user.roles && r.json.data.user.roles.length >= 1, 'F3: roles tidak kosong via HTTP.');
  assert_(!r.json.data.user.password_hash, 'F1: hash tidak bocor via HTTP.');
  console.log('PASS');
}

// T1 BARU: regresi F2 — token top-level, nested, dan tanpa token via HTTP.
function testHttpEnvelope_() {
  console.log('--- testHttpEnvelope_ ---');
  var url = getPlatformUrl_();
  if (!url) { console.log('SKIP: URL platform kosong. Deploy + simpanUrlPlatformSekarang() dulu.'); return; }
  var admin = testAdmin_();
  var token = createSession_(admin.id, { ip: '127.0.0.1', user_agent: 'TestSuite' });
  try {
    var a = httpPost_(url, { method: 'GET', path: '/api/v1/apps', token: token, data: {} });
    assert_(a.code === 200 && a.json.success, 'Token top-level diterima. Resp: ' + JSON.stringify(a.json).slice(0, 200));
    var b = httpPost_(url, { method: 'GET', path: '/api/v1/apps', data: { token: token } });
    assert_(b.code === 200 && b.json.success, 'F2: token nested di data diterima.');
    var c = httpPost_(url, { method: 'GET', path: '/api/v1/apps', data: {} });
    assert_(c.json && !c.json.success && c.json.error && c.json.error.code === 'UNAUTHORIZED', 'Tanpa token ditolak.');
  } finally { deleteSession_(token); }
  console.log('PASS');
}

// ==================== UTIL CACHE ====================
function clearReadCacheKeys_() {
  return Object.keys(SHEETS).map(function(k) { return 'readAll_' + SHEETS[k]; });
}

function clearAllCache() { CacheService.getScriptCache().removeAll(clearReadCacheKeys_()); }
function clearAllReadCache() { clearAllCache(); }
function cleanupLocksAndCache() { clearAllCache(); console.log('Pembersihan selesai.'); }
