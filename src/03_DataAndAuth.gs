// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 3: HELPER DATA & AUTH ====================
// Changelog v2:
// - F4: getNextId_ baru — UUID untuk sheet besar, angka+lock+fresh-read untuk master.
// - readAll_: master kecil di-cache 1 jam (CACHE_DURATION_MASTER).
// - getSpreadsheet_: memo per-eksekusi (hemat openById berulang).
// - F1: stripSecret_() + getUserDetail_ bersih dari hash.
// - loginUser_: hapus double-lookup, pencocokan email case-insensitive.
// - verifyGoogleToken_: tolak dini jika CLIENT_ID masih placeholder.
// - getCurrentUserEmail_: hapus fallback effective-user (lubang keamanan).

var _SS_MEMO_ = null; // memo spreadsheet per-eksekusi

function getSpreadsheet_() {
  if (_SS_MEMO_) return _SS_MEMO_;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID') || getConfig_('SPREADSHEET_ID', SPREADSHEET_ID);
  if (!id) throw new Error('Spreadsheet belum diinisialisasi. Jalankan setup().');
  _SS_MEMO_ = SpreadsheetApp.openById(id);
  return _SS_MEMO_;
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sheet;
}

function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = HEADERS[name];
    if (headers) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// Sheet yang tidak di-cache (besar/cepat berubah).
var NO_CACHE_SHEETS = [
  SHEETS.SESSIONS, SHEETS.AUDIT_EVENTS, SHEETS.FILES, SHEETS.FILE_VERSIONS,
  SHEETS.FILE_ACCESS_LOGS, SHEETS.NOTIFICATIONS, SHEETS.NOTIFICATION_RECIPIENTS,
  SHEETS.NOTIFICATION_DELIVERIES, SHEETS.NOTIFICATION_READ_RECEIPTS, SHEETS.TICKETS
];

function readAll_(sheetName) {
  var useCache = NO_CACHE_SHEETS.indexOf(sheetName) === -1;
  var ttl = (MASTER_CACHE_SHEETS.indexOf(sheetName) !== -1) ? CACHE_DURATION_MASTER : CACHE_DURATION;
  var cacheKey = 'readAll_' + sheetName;
  var cache = CacheService.getScriptCache();
  if (useCache) {
    var cached = cache.get(cacheKey);
    if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  }
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    if (useCache) { try { cache.put(cacheKey, JSON.stringify([]), ttl); } catch (e) {} }
    return [];
  }
  var headers = HEADERS[sheetName];
  if (!headers) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var result = values.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = (row[i] !== undefined && row[i] !== null) ? row[i] : ''; });
    return obj;
  });
  if (useCache) {
    try {
      var json = JSON.stringify(result);
      if (json.length < 100000) cache.put(cacheKey, json, ttl);
    } catch (e) {}
  }
  return result;
}

function invalidateCache_(sheetName) {
  try { CacheService.getScriptCache().remove('readAll_' + sheetName); } catch (e) {}
}

function findRow_(sheetName, column, value) {
  var targetVal = String(value === undefined || value === null ? '' : value).trim();
  var all = readAll_(sheetName);
  for (var i = 0; i < all.length; i++) {
    var v = all[i][column];
    if (String(v === undefined || v === null ? '' : v).trim() === targetVal) return all[i];
  }
  return null;
}

function findAll_(sheetName, filter) {
  filter = filter || {};
  var keys = Object.keys(filter);
  return readAll_(sheetName).filter(function(row) {
    return keys.every(function(key) { return String(row[key] === undefined ? '' : row[key]) === String(filter[key]); });
  });
}

function appendRow_(sheetName, rowObject) {
  var sheet = getSheet_(sheetName);
  var headers = HEADERS[sheetName];
  if (!headers) throw new Error('Sheet ' + sheetName + ' tidak terdaftar di HEADERS.');
  var row = headers.map(function(h) { return (rowObject[h] !== undefined && rowObject[h] !== null) ? rowObject[h] : ''; });
  sheet.appendRow(row);
  invalidateCache_(sheetName);
  var normalized = {};
  headers.forEach(function(h, i) { normalized[h] = row[i]; });
  return normalized;
}

function updateRow_(sheetName, id, updates) {
  updates = updates || {};
  var sheet = getSheet_(sheetName);
  var headers = HEADERS[sheetName];
  if (!headers) throw new Error('Sheet ' + sheetName + ' tidak terdaftar di HEADERS.');
  var idIndex = headers.indexOf('id');
  if (idIndex === -1) throw new Error('Sheet ' + sheetName + ' tidak memiliki kolom "id".');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(id)) {
      var newRow = headers.map(function(h, col) { return updates[h] !== undefined ? updates[h] : data[i][col]; });
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([newRow]);
      invalidateCache_(sheetName);
      return true;
    }
  }
  return false;
}

function deleteRow_(sheetName, id) {
  var sheet = getSheet_(sheetName);
  var headers = HEADERS[sheetName];
  if (!headers) throw new Error('Sheet ' + sheetName + ' tidak terdaftar di HEADERS.');
  var idIndex = headers.indexOf('id');
  if (idIndex === -1) throw new Error('Sheet ' + sheetName + ' tidak memiliki kolom "id".');
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idIndex]) === String(id)) {
      sheet.deleteRow(i + 1);
      invalidateCache_(sheetName);
      return true;
    }
  }
  return false;
}

function softDeleteRow_(sheetName, id) {
  var headers = HEADERS[sheetName];
  if (!headers) throw new Error('Sheet ' + sheetName + ' tidak terdaftar di HEADERS.');
  if (headers.indexOf('is_deleted') !== -1 && headers.indexOf('deleted_at') !== -1) {
    return updateRow_(sheetName, id, { is_deleted: true, deleted_at: new Date().toISOString() });
  }
  return deleteRow_(sheetName, id);
}

// F4: sheet besar -> UUID (tanpa scan). Master kecil -> angka max+1 (lock + baca fresh).
function getNextId_(sheetName) {
  if (UUID_SHEETS.indexOf(sheetName) !== -1) return Utilities.getUuid();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    invalidateCache_(sheetName); // paksa baca kondisi terbaru (anti-kembar)
    var all = readAll_(sheetName);
    if (all.length === 0) return 1;
    var maxId = all.reduce(function(max, row) { return Math.max(max, Number(row.id) || 0); }, 0);
    return maxId + 1;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getUserRoles_(userId) {
  var userRoles = findAll_(SHEETS.USER_ROLES, { user_id: userId });
  var roles = readAll_(SHEETS.ROLES);
  return roles.filter(function(r) {
    return userRoles.some(function(ur) { return String(ur.role_id) === String(r.id); });
  });
}

function logAudit_(params) {
  params = params || {};
  var event = {
    id: getNextId_(SHEETS.AUDIT_EVENTS), // UUID (F4) — tanpa scan
    timestamp: new Date().toISOString(),
    actor_id: params.actorId || 'system',
    application_id: APPLICATION_ID,
    action: params.action || 'UNKNOWN',
    resource_type: params.resourceType || '',
    resource_id: params.resourceId || '',
    result: params.result || 'SUCCESS',
    ip: params.ip || '',
    user_agent: params.userAgent || '',
    request_id: params.requestId || '',
    correlation_id: params.correlationId || '',
    metadata: (typeof params.metadata === 'object') ? JSON.stringify(params.metadata || {}) : String(params.metadata || '')
  };
  appendRow_(SHEETS.AUDIT_EVENTS, event);
  return event;
}

function sanitizeFileName_(fileName) {
  if (!fileName) return '';
  var sanitized = String(fileName).replace(/\.\.(\/|\\)/g, '').replace(/[\/\\]/g, '_').replace(/[^\w\.\- ]/g, '_').trim().substring(0, 255);
  return sanitized || 'unnamed_file';
}

function isAllowedMimeType_(mimeType) {
  var allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'image/jpeg', 'image/png', 'image/gif', 'application/zip',
    'application/x-rar-compressed', 'application/json', 'application/xml', 'text/xml'];
  if (!mimeType) return false;
  return allowed.indexOf(mimeType) !== -1;
}

function generateChecksum_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(byte) { return ('0' + (byte & 0xFF).toString(16)).slice(-2); }).join('');
}

// F1: buang rahasia sebelum objek user dikirim ke client. WAJIB dipakai di semua return user.
function stripSecret_(u) {
  if (!u) return u;
  var c = Object.assign({}, u);
  delete c.password_hash; delete c.password_salt; delete c.password;
  return c;
}

// Cari user by email tanpa peduli huruf besar/kecil.
function findUserByEmail_(email) {
  var target = String(email || '').toLowerCase().trim();
  var users = readAll_(SHEETS.USERS);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email || '').toLowerCase().trim() === target) return users[i];
  }
  return null;
}

// ==================== AUTH ====================
// PERBAIKAN: tanpa fallback effective-user. Anonim = tolak (jangan dianggap pemilik script).
function getCurrentUserEmail_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  if (!email) throw new Error('Tidak dapat menentukan email pengguna. Pastikan Web App dideploy untuk "Anyone with Google account" dan Anda sudah login Google.');
  return email;
}

function createSession_(userId, metadata) {
  metadata = metadata || {};
  var token = Utilities.getUuid();
  var now = new Date();
  appendRow_(SHEETS.SESSIONS, {
    id: getNextId_(SHEETS.SESSIONS), user_id: userId, token: token,
    created_at: now.toISOString(), expires_at: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    ip: metadata.ip || '', user_agent: metadata.user_agent || '',
    last_activity_at: now.toISOString(), revoked_at: ''
  });
  return token;
}

function getUserByToken_(token) {
  if (!token) return null;
  var session = findRow_(SHEETS.SESSIONS, 'token', token);
  if (!session) return null;
  var now = new Date();
  if (session.revoked_at || new Date(session.expires_at) < now) {
    if (!session.revoked_at) updateRow_(SHEETS.SESSIONS, session.id, { revoked_at: now.toISOString() });
    return null;
  }
  var expires = new Date(session.expires_at);
  if (expires.getTime() - now.getTime() < 60 * 60 * 1000) {
    updateRow_(SHEETS.SESSIONS, session.id, { expires_at: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(), last_activity_at: now.toISOString() });
  } else {
    var lastActivity = new Date(session.last_activity_at);
    if (now.getTime() - lastActivity.getTime() > 15 * 60 * 1000) {
      updateRow_(SHEETS.SESSIONS, session.id, { last_activity_at: now.toISOString() });
    }
  }
  return findRow_(SHEETS.USERS, 'id', session.user_id);
}

function deleteSession_(token) {
  var session = findRow_(SHEETS.SESSIONS, 'token', token);
  if (session && !session.revoked_at) updateRow_(SHEETS.SESSIONS, session.id, { revoked_at: new Date().toISOString() });
}

function revokeAllSessionsForUser_(userId) {
  findAll_(SHEETS.SESSIONS, { user_id: userId }).forEach(function(s) {
    if (!s.revoked_at) updateRow_(SHEETS.SESSIONS, s.id, { revoked_at: new Date().toISOString() });
  });
}

function cleanupExpiredSessions_() {
  var sessions = readAll_(SHEETS.SESSIONS);
  var now = new Date();
  var count = 0;
  sessions.forEach(function(s) {
    if (!s.revoked_at) {
      try {
        if (new Date(s.expires_at) < now) { updateRow_(SHEETS.SESSIONS, s.id, { revoked_at: now.toISOString() }); count++; }
      } catch (e) {}
    }
  });
  Logger.log('Bersih session selesai. Ditandai revoked: ' + count);
  return count;
}

function getUserPermissions_(userId) {
  var roles = getUserRoles_(userId);
  var roleIds = {};
  roles.forEach(function(r) { roleIds[String(r.id)] = true; });
  if (Object.keys(roleIds).length === 0) return [];
  var permissionIds = {};
  readAll_(SHEETS.ROLE_PERMISSIONS).forEach(function(rp) {
    if (roleIds[String(rp.role_id)]) permissionIds[String(rp.permission_id)] = true;
  });
  return readAll_(SHEETS.PERMISSIONS).filter(function(p) { return permissionIds[String(p.id)]; }).map(function(p) { return p.code; });
}

function hasPermission_(user, resource, action) {
  if (!user) return false;
  return getUserPermissions_(user.id).indexOf(resource + '.' + action) !== -1;
}

function requirePermission_(user, resource, action) {
  if (!hasPermission_(user, resource, action)) throw new Error('FORBIDDEN: Akses ditolak');
}

function hasRole_(user, roleCode) {
  return getUserRoles_(user.id).some(function(r) { return r.code === roleCode; });
}

function getUserDetail_(user) {
  var roles = getUserRoles_(user.id);
  var permissions = getUserPermissions_(user.id);
  var safe = stripSecret_(user); // F1
  safe.roles = roles.map(function(r) { return r.code; });
  safe.permissions = permissions;
  return safe;
}

function verifyGoogleToken_(idToken) {
  var clientId = getConfig_('CLIENT_ID', CLIENT_ID);
  if (!clientId || clientId.indexOf('YOUR_CLIENT_ID') === 0) {
    throw new Error('CLIENT_ID belum dikonfigurasi. Login Google dinonaktifkan sampai Client ID asli diisi di Config/Properties.');
  }
  try {
    var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Token tidak valid');
    var payload = JSON.parse(response.getContentText());
    if (!payload.email) throw new Error('Token tidak mengandung email');
    if (payload.aud !== clientId && payload.azp !== clientId) throw new Error('Token tidak diterbitkan untuk aplikasi ini');
    if (payload.email_verified === false) throw new Error('Email belum terverifikasi');
    return payload;
  } catch (e) {
    throw new Error('Gagal verifikasi token: ' + e.message);
  }
}

// PERBAIKAN: 1x lookup (case-insensitive), tanpa double-lookup yang bikin mismatch huruf.
function loginUser_(body, context) {
  body = body || {};
  context = context || {};
  var user = null;
  if (body.identifier && body.password) {
    var identifier = String(body.identifier).toLowerCase().trim();
    var users = readAll_(SHEETS.USERS);
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].email || '').toLowerCase() === identifier || String(users[i].username || '').toLowerCase() === identifier) { user = users[i]; break; }
    }
    if (!user) throw new Error('Kredensial tidak ditemukan. Periksa kembali username/email Anda.');
    if (user.status !== 'active') throw new Error('User tidak aktif. Hubungi administrator.');
    if (!user.password_hash) {
      logAudit_({ actorId: user.id, action: 'auth.login_failed', resourceType: 'user', resourceId: user.id, result: 'FAILED', ip: context.ip || '', userAgent: context.user_agent || '' });
      throw new Error('Akun belum memiliki password. Hubungi administrator untuk reset password.');
    }
    if (!verifyPassword_(String(body.password), user.password_hash, user.password_salt)) {
      logAudit_({ actorId: user.id, action: 'auth.login_failed', resourceType: 'user', resourceId: user.id, result: 'FAILED', ip: context.ip || '', userAgent: context.user_agent || '' });
      throw new Error('Password salah. Silakan coba lagi.');
    }
  } else if (body.token) {
    user = findUserByEmail_(verifyGoogleToken_(body.token).email);
    if (!user) throw new Error('User tidak terdaftar. Hubungi administrator.');
  } else {
    user = findUserByEmail_(getCurrentUserEmail_());
    if (!user) throw new Error('User tidak terdaftar. Hubungi administrator.');
  }
  if (user.status !== 'active') throw new Error('User tidak aktif. Hubungi administrator.');
  var ip = context.ip || '';
  var userAgent = context.user_agent || '';
  var token = createSession_(user.id, { ip: ip, user_agent: userAgent });
  try { updateRow_(SHEETS.USERS, user.id, { last_login_at: new Date().toISOString() }); } catch (e) {}
  logAudit_({ actorId: user.id, action: 'auth.login', resourceType: 'session', resourceId: token, result: 'SUCCESS', ip: ip, userAgent: userAgent });
  return { token: token, user: getUserDetail_(user) };
}

function getSession_(body, context) {
  var user = getUserByToken_(body.token);
  if (!user) throw new Error('Session tidak valid atau expired.');
  return { user: getUserDetail_(user) };
}

function logoutUser_(body, context) {
  var user = getUserByToken_(body.token);
  if (user) {
    try {
      logAudit_({ actorId: user.id, action: 'auth.logout', resourceType: 'session', resourceId: body.token, result: 'SUCCESS', ip: context.ip || '', userAgent: context.user_agent || '' });
    } catch (e) {}
    deleteSession_(body.token);
  }
  return { message: 'Logout berhasil' };
}

function generateSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

function hashPassword_(password, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt || ''))
    .map(function(byte) { return ('0' + (byte & 0xFF).toString(16)).slice(-2); }).join('');
}

function verifyPassword_(password, hash, salt) { return hashPassword_(password, salt) === hash; }

function repairUserPasswords() { return repairUserPasswords_(); }

function repairUserPasswords_() {
  var users = readAll_(SHEETS.USERS);
  var updatedCount = 0;
  users.forEach(function(user) {
    if (!user.password_hash) {
      var defaultPassword = (user.username === 'admin' || user.email === DEFAULT_ADMIN_EMAIL) ? 'admin123' : 'password123';
      var salt = generateSalt_();
      updateRow_(SHEETS.USERS, user.id, { password_hash: hashPassword_(defaultPassword, salt), password_salt: salt });
      updatedCount++;
    }
  });
  Logger.log('Berhasil mengisi password untuk ' + updatedCount + ' user. (Password default — wajib diganti.)');
  return updatedCount;
}

function cleanupExpiredSessions() { return cleanupExpiredSessions_(); }
