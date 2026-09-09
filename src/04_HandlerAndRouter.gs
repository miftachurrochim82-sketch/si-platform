// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 4: HANDLER & ROUTER ====================
// Changelog v2:
// - F1: semua return user lewat stripSecret_ (list/create/update).
// - F9a: listUsers_ enrich roles HANYA untuk halaman tampil.
// - create/updateUser_: validasi email + cek duplikat case-insensitive.
// - updateUser_: status->inactive ikut mencabut session. deleteUser_: cegah admin terakhir.
// - F10a: assignRoles/assignPermissions + remove*: dibungkus lock.
// - updateSetting_: lock versi. createFolder_/uploadFile_: root via config + sanitasi nama.
// - uploadFile_: hitung bytes sekali. sendNotification_: tolak non-email + batasi penerima.
// - processNotificationQueue_: hormati scheduled_at. healthCheck_: tanpa bocor Spreadsheet ID.
// - F9b/c: listAuditEvents_ dibatasi + getDashboardStats_ di-cache.
// - F3: validateAppTicket_ roles pakai String(). createAccessTicket_: warning app tak dikenal.
// - F2: doPost baca token dari 3 tempat. doPost error internal: generik + log.
// - handleApiRequest_: requestId di meta error. executeHandler_: audit error best-effort.
// - doGet: framing SAMEORIGIN.

// ==================== USER HANDLER ====================
function listUsers_(query, context) {
  query = query || {};
  requirePermission_(context.user, 'user', 'read');
  var users = readAll_(SHEETS.USERS);
  if (query.search) {
    var q = String(query.search).toLowerCase();
    users = users.filter(function(u) {
      return String(u.username).toLowerCase().indexOf(q) !== -1 || String(u.email).toLowerCase().indexOf(q) !== -1 || String(u.display_name).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (query.status) users = users.filter(function(u) { return u.status === query.status; });
  if (query.sortBy && ['username', 'email', 'display_name', 'status', 'created_at'].indexOf(query.sortBy) !== -1) {
    var dir = query.sortOrder === 'desc' ? -1 : 1;
    users.sort(function(a, b) {
      var va = a[query.sortBy] || '', vb = b[query.sortBy] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va > vb ? dir : va < vb ? -dir : 0;
    });
  }
  var page = parseInt(query.page, 10) || 1;
  var pageSize = parseInt(query.pageSize, 10) || 10;
  var total = users.length;
  var start = (page - 1) * pageSize;
  var paginatedUsers = users.slice(start, start + pageSize);
  // F9a: enrich HANYA halaman ini (hemat 2 scan besar per halaman tak tampil).
  var userRoles = readAll_(SHEETS.USER_ROLES);
  var roles = readAll_(SHEETS.ROLES);
  paginatedUsers = paginatedUsers.map(function(u) {
    var roleIds = userRoles.filter(function(ur) { return String(ur.user_id) === String(u.id); }).map(function(ur) { return ur.role_id; });
    var roleCodes = roles.filter(function(r) { return roleIds.some(function(rid) { return String(rid) === String(r.id); }); }).map(function(r) { return r.code; });
    var safe = stripSecret_(u); // F1
    safe.roles = roleCodes;
    return safe;
  });
  return { data: paginatedUsers, meta: { total: total, page: page, pageSize: pageSize, totalPages: Math.ceil(total / pageSize) } };
}

function createUser_(data, context) {
  data = data || {};
  requirePermission_(context.user, 'user', 'create');
  if (!data.username || !data.email) throw new Error('Username dan email wajib diisi.');
  if (!isValidEmail_(data.email)) throw new Error('Format email tidak valid.');
  var allUsers = readAll_(SHEETS.USERS);
  var emailL = String(data.email).toLowerCase().trim();
  var userL = String(data.username).toLowerCase().trim();
  for (var i = 0; i < allUsers.length; i++) {
    if (String(allUsers[i].email || '').toLowerCase().trim() === emailL) throw new Error('Email sudah terdaftar.');
    if (String(allUsers[i].username || '').toLowerCase().trim() === userL) throw new Error('Username sudah digunakan.');
  }
  var password = data.password || 'password123';
  if (String(password).length < 6) throw new Error('Password minimal 6 karakter.');
  if (!data.password) Logger.log('ℹ️ User ' + data.email + ' dibuat dengan password default. Minta user mengganti.');
  var now = new Date().toISOString();
  var salt = generateSalt_();
  var newUser = {
    id: getNextId_(SHEETS.USERS), username: String(data.username).trim(), email: String(data.email).trim(),
    display_name: data.display_name || '', status: 'active', phone: data.phone || '', avatar_url: data.avatar_url || '',
    last_login_at: '', created_at: now, updated_at: now,
    password_hash: hashPassword_(password, salt), password_salt: salt
  };
  appendRow_(SHEETS.USERS, newUser);
  logAudit_({ actorId: context.user.id, action: 'user.create', resourceType: 'user', resourceId: newUser.id, result: 'SUCCESS', metadata: { email: newUser.email } });
  return stripSecret_(newUser); // F1
}

function updateUser_(userId, data, context) {
  data = data || {};
  requirePermission_(context.user, 'user', 'update');
  var user = findRow_(SHEETS.USERS, 'id', userId);
  if (!user) throw new Error('User tidak ditemukan.');
  var allowedFields = ['username', 'email', 'display_name', 'phone', 'avatar_url', 'status'];
  var updates = {};
  allowedFields.forEach(function(f) { if (data[f] !== undefined) updates[f] = data[f]; });
  if (updates.email) {
    if (!isValidEmail_(updates.email)) throw new Error('Format email tidak valid.');
    if (String(updates.email).toLowerCase().trim() !== String(user.email || '').toLowerCase().trim()) {
      var allUsers = readAll_(SHEETS.USERS);
      for (var i = 0; i < allUsers.length; i++) {
        if (String(allUsers[i].email || '').toLowerCase().trim() === String(updates.email).toLowerCase().trim()) throw new Error('Email sudah digunakan.');
      }
    }
    updates.email = String(updates.email).trim();
  }
  if (updates.username && String(updates.username).toLowerCase().trim() !== String(user.username || '').toLowerCase().trim()) {
    var allUsers2 = readAll_(SHEETS.USERS);
    for (var j = 0; j < allUsers2.length; j++) {
      if (String(allUsers2[j].username || '').toLowerCase().trim() === String(updates.username).toLowerCase().trim()) throw new Error('Username sudah digunakan.');
    }
    updates.username = String(updates.username).trim();
  }
  updates.updated_at = new Date().toISOString();
  updateRow_(SHEETS.USERS, userId, updates);
  if (updates.status === 'inactive' && user.status !== 'inactive') revokeAllSessionsForUser_(userId); // konsisten dgn delete
  logAudit_({ actorId: context.user.id, action: 'user.update', resourceType: 'user', resourceId: userId, result: 'SUCCESS', metadata: { updates: Object.keys(updates) } });
  return stripSecret_(findRow_(SHEETS.USERS, 'id', userId)); // F1
}

function deleteUser_(userId, context) {
  requirePermission_(context.user, 'user', 'delete');
  if (String(userId) === String(context.user.id)) throw new Error('Tidak dapat menonaktifkan akun sendiri.');
  var user = findRow_(SHEETS.USERS, 'id', userId);
  if (!user) throw new Error('User tidak ditemukan.');
  // Cegah mengunci sistem: tolak jika ini admin aktif terakhir.
  var isAdmin = getUserRoles_(userId).some(function(r) { return r.code === 'admin'; });
  if (isAdmin) {
    var adminRole = findRow_(SHEETS.ROLES, 'code', 'admin');
    if (adminRole) {
      var adminIds = {};
      readAll_(SHEETS.USER_ROLES).forEach(function(ur) { if (String(ur.role_id) === String(adminRole.id)) adminIds[String(ur.user_id)] = true; });
      var activeAdmins = readAll_(SHEETS.USERS).filter(function(u) { return u.status === 'active' && adminIds[String(u.id)]; }).length;
      if (activeAdmins <= 1) throw new Error('Tidak dapat menonaktifkan admin aktif terakhir.');
    }
  }
  updateRow_(SHEETS.USERS, userId, { status: 'inactive', updated_at: new Date().toISOString() });
  revokeAllSessionsForUser_(userId);
  logAudit_({ actorId: context.user.id, action: 'user.delete', resourceType: 'user', resourceId: userId, result: 'SUCCESS' });
  return { id: userId, status: 'inactive' };
}

// F10a: tulis-ulang dibungkus lock.
function assignRolesToUser_(userId, data, context) {
  data = data || {};
  requirePermission_(context.user, 'user', 'update');
  var role_ids = data.role_ids;
  if (!role_ids || !Array.isArray(role_ids)) throw new Error('role_ids harus array.');
  var validIds = readAll_(SHEETS.ROLES).map(function(r) { return String(r.id); });
  role_ids.forEach(function(rid) { if (validIds.indexOf(String(rid)) === -1) throw new Error('Role ID ' + rid + ' tidak valid.'); });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var headers = HEADERS[SHEETS.USER_ROLES];
    var rowsToKeep = readAll_(SHEETS.USER_ROLES).filter(function(ur) { return String(ur.user_id) !== String(userId); });
    var now = new Date().toISOString();
    var newRows = [headers];
    rowsToKeep.forEach(function(ur) { newRows.push([ur.user_id, ur.role_id, ur.assigned_at, ur.assigned_by]); });
    role_ids.forEach(function(rid) { newRows.push([userId, rid, now, context.user.id]); });
    var sheet = getSheet_(SHEETS.USER_ROLES);
    sheet.clearContents();
    sheet.getRange(1, 1, newRows.length, headers.length).setValues(newRows);
    invalidateCache_(SHEETS.USER_ROLES);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  logAudit_({ actorId: context.user.id, action: 'user.roles.assign', resourceType: 'user', resourceId: userId, result: 'SUCCESS', metadata: { role_ids: role_ids } });
  return { user_id: userId, role_ids: role_ids };
}

function removeRoleFromUser_(userId, roleId, context) {
  requirePermission_(context.user, 'user', 'update');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var all = readAll_(SHEETS.USER_ROLES);
    var index = -1;
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].user_id) === String(userId) && String(all[i].role_id) === String(roleId)) { index = i; break; }
    }
    if (index === -1) throw new Error('Role tidak terpasang pada user.');
    getSheet_(SHEETS.USER_ROLES).deleteRow(index + 2);
    invalidateCache_(SHEETS.USER_ROLES);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  logAudit_({ actorId: context.user.id, action: 'user.roles.remove', resourceType: 'user', resourceId: userId, result: 'SUCCESS', metadata: { roleId: roleId } });
  return { user_id: userId, role_id: roleId };
}

// ==================== ROLE HANDLER ====================
function listRoles_(query, context) {
  requirePermission_(context.user, 'role', 'read');
  var rolePerms = readAll_(SHEETS.ROLE_PERMISSIONS);
  var permMap = {};
  readAll_(SHEETS.PERMISSIONS).forEach(function(p) { permMap[String(p.id)] = p.code; });
  return {
    data: readAll_(SHEETS.ROLES).map(function(role) {
      var permIds = rolePerms.filter(function(rp) { return String(rp.role_id) === String(role.id); }).map(function(rp) { return rp.permission_id; });
      var out = Object.assign({}, role);
      out.permissions = permIds.map(function(pid) { return permMap[String(pid)]; }).filter(Boolean);
      return out;
    })
  };
}

function createRole_(data, context) {
  data = data || {};
  requirePermission_(context.user, 'role', 'create');
  if (!data.code || !data.name) throw new Error('code dan name wajib diisi.');
  if (data.scope && ROLE_SCOPES.indexOf(data.scope) === -1) throw new Error('Scope tidak valid. Pilihan: ' + ROLE_SCOPES.join(', '));
  if (findRow_(SHEETS.ROLES, 'code', data.code)) throw new Error("Role dengan code '" + data.code + "' sudah ada.");
  var now = new Date().toISOString();
  var newRole = { id: getNextId_(SHEETS.ROLES), code: String(data.code).trim(), name: data.name, scope: data.scope || 'global', status: 'active', created_at: now, updated_at: now };
  appendRow_(SHEETS.ROLES, newRole);
  logAudit_({ actorId: context.user.id, action: 'role.create', resourceType: 'role', resourceId: newRole.id, result: 'SUCCESS' });
  return newRole;
}

function updateRole_(roleId, data, context) {
  data = data || {};
  requirePermission_(context.user, 'role', 'update');
  if (!findRow_(SHEETS.ROLES, 'id', roleId)) throw new Error('Role tidak ditemukan.');
  var updates = {};
  ['name', 'scope', 'status'].forEach(function(f) { if (data[f] !== undefined) updates[f] = data[f]; });
  if (updates.scope && ROLE_SCOPES.indexOf(updates.scope) === -1) throw new Error('Scope tidak valid.');
  updates.updated_at = new Date().toISOString();
  updateRow_(SHEETS.ROLES, roleId, updates);
  logAudit_({ actorId: context.user.id, action: 'role.update', resourceType: 'role', resourceId: roleId, result: 'SUCCESS' });
  return findRow_(SHEETS.ROLES, 'id', roleId);
}

function assignPermissionsToRole_(roleId, data, context) {
  data = data || {};
  requirePermission_(context.user, 'role', 'update');
  var permission_ids = data.permission_ids;
  if (!permission_ids || !Array.isArray(permission_ids)) throw new Error('permission_ids harus array.');
  var validIds = readAll_(SHEETS.PERMISSIONS).map(function(p) { return String(p.id); });
  permission_ids.forEach(function(pid) { if (validIds.indexOf(String(pid)) === -1) throw new Error('Permission ID ' + pid + ' tidak valid.'); });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var headers = HEADERS[SHEETS.ROLE_PERMISSIONS];
    var rowsToKeep = readAll_(SHEETS.ROLE_PERMISSIONS).filter(function(rp) { return String(rp.role_id) !== String(roleId); });
    var newRows = [headers];
    rowsToKeep.forEach(function(rp) { newRows.push([rp.role_id, rp.permission_id]); });
    permission_ids.forEach(function(pid) { newRows.push([roleId, pid]); });
    var sheet = getSheet_(SHEETS.ROLE_PERMISSIONS);
    sheet.clearContents();
    sheet.getRange(1, 1, newRows.length, headers.length).setValues(newRows);
    invalidateCache_(SHEETS.ROLE_PERMISSIONS);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  logAudit_({ actorId: context.user.id, action: 'role.permissions.assign', resourceType: 'role', resourceId: roleId, result: 'SUCCESS', metadata: { permission_ids: permission_ids } });
  return { role_id: roleId, permission_ids: permission_ids };
}

function removePermissionFromRole_(roleId, permissionId, context) {
  requirePermission_(context.user, 'role', 'update');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var all = readAll_(SHEETS.ROLE_PERMISSIONS);
    var index = -1;
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].role_id) === String(roleId) && String(all[i].permission_id) === String(permissionId)) { index = i; break; }
    }
    if (index === -1) throw new Error('Permission tidak terpasang pada role ini.');
    getSheet_(SHEETS.ROLE_PERMISSIONS).deleteRow(index + 2);
    invalidateCache_(SHEETS.ROLE_PERMISSIONS);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  logAudit_({ actorId: context.user.id, action: 'role.permissions.remove', resourceType: 'role', resourceId: roleId, result: 'SUCCESS', metadata: { permissionId: permissionId } });
  return { role_id: roleId, permission_id: permissionId };
}

// ==================== PERMISSION HANDLER ====================
function listPermissions_(query, context) {
  requirePermission_(context.user, 'permission', 'read');
  return { data: readAll_(SHEETS.PERMISSIONS) };
}

// ==================== SETTING HANDLER ====================
function listSettings_(query, context) {
  query = query || {};
  requirePermission_(context.user, 'setting', 'read');
  var settings = readAll_(SHEETS.SETTINGS);
  if (query.scope_type) settings = settings.filter(function(s) { return s.scope_type === query.scope_type; });
  var page = parseInt(query.page, 10) || 1;
  var pageSize = parseInt(query.pageSize, 10) || 10;
  var total = settings.length;
  return { data: settings.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), meta: { total: total, page: page, pageSize: pageSize, totalPages: Math.ceil(total / pageSize) } };
}

function getSettingByKey_(key, context) {
  requirePermission_(context.user, 'setting', 'read');
  var setting = findRow_(SHEETS.SETTINGS, 'key', key);
  if (!setting) throw new Error('Setting tidak ditemukan.');
  return setting;
}

// Lock agar kenaikan versi tidak kembar saat update bersamaan.
function updateSetting_(key, body, context) {
  body = body || {};
  requirePermission_(context.user, 'setting', 'update');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var setting = findRow_(SHEETS.SETTINGS, 'key', key);
    if (!setting) throw new Error('Setting tidak ditemukan.');
    var newValue = (body.value !== undefined) ? body.value : JSON.parse(setting.value_json);
    var oldValue = setting.value_json;
    var newVersion = Number(setting.version) + 1;
    var now = new Date().toISOString();
    updateRow_(SHEETS.SETTINGS, setting.id, { value_json: JSON.stringify(newValue), version: newVersion, updated_by: context.user.id, updated_at: now });
    appendRow_(SHEETS.SETTING_VERSIONS, { id: getNextId_(SHEETS.SETTING_VERSIONS), setting_id: setting.id, version_no: newVersion, value_json: JSON.stringify(newValue), updated_by: context.user.id, updated_at: now });
    appendRow_(SHEETS.SETTING_CHANGE_LOGS, { id: getNextId_(SHEETS.SETTING_CHANGE_LOGS), setting_id: setting.id, action: 'update', old_value: oldValue, new_value: JSON.stringify(newValue), changed_by: context.user.id, changed_at: now });
    logAudit_({ actorId: context.user.id, action: 'setting.update', resourceType: 'setting', resourceId: key, result: 'SUCCESS', metadata: { version: newVersion } });
    return findRow_(SHEETS.SETTINGS, 'id', setting.id);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getSettingHistory_(key, context) {
  requirePermission_(context.user, 'setting', 'read');
  var setting = findRow_(SHEETS.SETTINGS, 'key', key);
  if (!setting) throw new Error('Setting tidak ditemukan.');
  return { setting: setting, versions: findAll_(SHEETS.SETTING_VERSIONS, { setting_id: setting.id }), logs: findAll_(SHEETS.SETTING_CHANGE_LOGS, { setting_id: setting.id }) };
}

// ==================== FILE & FOLDER HANDLER ====================
// Catatan: permission folder.* (create/update/delete) belum dipakai; tahap 1 tetap
// memakai file.update agar role lama tidak tiba-tiba kehilangan akses. Migrasi di tahap 2.
function listFolders_(query, context) {
  requirePermission_(context.user, 'file', 'read');
  return { data: readAll_(SHEETS.FOLDERS) };
}

function createFolder_(body, context) {
  body = body || {};
  requirePermission_(context.user, 'file', 'update');
  var name = sanitizeFileName_(body.name);
  var parentId = body.parent_id || null;
  if (!name) throw new Error('Nama folder wajib diisi.');
  var parentDriveFolder;
  if (parentId) {
    var parentMeta = findRow_(SHEETS.FOLDERS, 'id', parentId);
    if (!parentMeta || !parentMeta.drive_folder_id) throw new Error('Parent folder tidak valid.');
    parentDriveFolder = DriveApp.getFolderById(parentMeta.drive_folder_id);
  } else {
    parentDriveFolder = DriveApp.getFolderById(getConfig_('DRIVE_ROOT_FOLDER_ID', DRIVE_ROOT_FOLDER_ID));
  }
  var driveFolder = parentDriveFolder.createFolder(name);
  var now = new Date().toISOString();
  var newFolder = { id: getNextId_(SHEETS.FOLDERS), name: name, parent_id: parentId || '', owner_id: context.user.id, drive_folder_id: driveFolder.getId(), created_at: now, updated_at: now };
  appendRow_(SHEETS.FOLDERS, newFolder);
  logAudit_({ actorId: context.user.id, action: 'folder.create', resourceType: 'folder', resourceId: newFolder.id, result: 'SUCCESS', metadata: { name: name } });
  return newFolder;
}

function listFiles_(query, context) {
  query = query || {};
  requirePermission_(context.user, 'file', 'read');
  var files = readAll_(SHEETS.FILES);
  if (query.folder_id) files = files.filter(function(f) { return String(f.folder_id) === String(query.folder_id); });
  if (query.show_deleted !== 'true') files = files.filter(function(f) { return !(f.is_deleted === true || f.is_deleted === 'true'); });
  if (query.sortBy && ['original_name', 'size', 'created_at'].indexOf(query.sortBy) !== -1) {
    var dir = query.sortOrder === 'desc' ? -1 : 1;
    files.sort(function(a, b) {
      var va = a[query.sortBy] || '', vb = b[query.sortBy] || '';
      if (query.sortBy === 'size') { va = Number(va); vb = Number(vb); }
      else if (query.sortBy === 'created_at') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
      else { if (typeof va === 'string') va = va.toLowerCase(); if (typeof vb === 'string') vb = vb.toLowerCase(); }
      return va > vb ? dir : va < vb ? -dir : 0;
    });
  }
  var page = parseInt(query.page, 10) || 1;
  var pageSize = parseInt(query.pageSize, 10) || 10;
  var total = files.length;
  return { data: files.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), meta: { total: total, page: page, pageSize: pageSize, totalPages: Math.ceil(total / pageSize) } };
}

function uploadFile_(body, context) {
  body = body || {};
  requirePermission_(context.user, 'file', 'upload');
  var fileName = sanitizeFileName_(body.file_name);
  var mimeType = body.mime_type || 'application/octet-stream';
  var dataBase64 = body.data_base64;
  var folderId = body.folder_id || null;
  if (!fileName || !dataBase64) throw new Error('file_name dan data_base64 wajib diisi.');
  if (!isAllowedMimeType_(mimeType)) throw new Error('Tipe file tidak diizinkan.');
  if (Math.ceil(dataBase64.length * 3 / 4) > MAX_UPLOAD_SIZE_BYTES) throw new Error('Ukuran file melebihi batas maksimal 10MB.');
  var decoded = Utilities.base64Decode(dataBase64);
  var size = decoded.length;
  var blob = Utilities.newBlob(decoded, mimeType, fileName);
  var driveFolder;
  if (folderId) {
    var folderMeta = findRow_(SHEETS.FOLDERS, 'id', folderId);
    if (!folderMeta || !folderMeta.drive_folder_id) throw new Error('Folder tujuan tidak valid.');
    driveFolder = DriveApp.getFolderById(folderMeta.drive_folder_id);
  } else {
    driveFolder = DriveApp.getFolderById(getConfig_('DRIVE_ROOT_FOLDER_ID', DRIVE_ROOT_FOLDER_ID));
  }
  var driveFile = driveFolder.createFile(blob);
  var now = new Date().toISOString();
  var checksum = generateChecksum_(decoded);
  var newFile = { id: getNextId_(SHEETS.FILES), folder_id: folderId || '', owner_id: context.user.id, storage_key: driveFile.getId(), original_name: fileName, mime_type: mimeType, size: size, checksum: checksum, current_version_id: '', is_deleted: false, deleted_at: '', created_at: now, updated_at: now };
  appendRow_(SHEETS.FILES, newFile);
  var versionId = getNextId_(SHEETS.FILE_VERSIONS);
  appendRow_(SHEETS.FILE_VERSIONS, { id: versionId, file_id: newFile.id, version_no: 1, storage_key: driveFile.getId(), checksum: checksum, size: size, created_by: context.user.id, created_at: now });
  updateRow_(SHEETS.FILES, newFile.id, { current_version_id: versionId });
  logAudit_({ actorId: context.user.id, action: 'file.upload', resourceType: 'file', resourceId: newFile.id, result: 'SUCCESS', metadata: { file_name: fileName } });
  return findRow_(SHEETS.FILES, 'id', newFile.id);
}

// Catatan: ACL per-file (sheet file_permissions) BELUM ditegakkan tahap 1 —
// siapa pun ber-permission file.read bisa unduh file mana pun via ID. Tahap 2: cek grant.
function downloadFile_(id, context) {
  requirePermission_(context.user, 'file', 'read');
  var file = findRow_(SHEETS.FILES, 'id', id);
  if (!file || file.is_deleted === true || file.is_deleted === 'true') throw new Error('File tidak ditemukan.');
  appendRow_(SHEETS.FILE_ACCESS_LOGS, { id: getNextId_(SHEETS.FILE_ACCESS_LOGS), file_id: id, user_id: context.user.id, action: 'download', timestamp: new Date().toISOString() });
  var blob = DriveApp.getFileById(file.storage_key).getBlob();
  return { file_name: file.original_name, mime_type: file.mime_type, data_base64: Utilities.base64Encode(blob.getBytes()) };
}

function deleteFile_(id, context) {
  requirePermission_(context.user, 'file', 'delete');
  if (!findRow_(SHEETS.FILES, 'id', id)) throw new Error('File tidak ditemukan.');
  updateRow_(SHEETS.FILES, id, { is_deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  logAudit_({ actorId: context.user.id, action: 'file.delete', resourceType: 'file', resourceId: id, result: 'SUCCESS' });
  return { message: 'File dihapus.' };
}

function listFileVersions_(id, context) {
  requirePermission_(context.user, 'file', 'read');
  return { data: findAll_(SHEETS.FILE_VERSIONS, { file_id: id }) };
}

// ==================== NOTIFICATION HANDLER ====================
function listNotificationTemplates_(query, context) {
  requirePermission_(context.user, 'notification', 'read');
  return { data: readAll_(SHEETS.NOTIFICATION_TEMPLATES) };
}

function createNotificationTemplate_(body, context) {
  body = body || {};
  requirePermission_(context.user, 'notification', 'manage');
  if (!body.code || !body.name || !body.channel) throw new Error('code, name, channel wajib diisi.');
  var now = new Date().toISOString();
  var template = { id: getNextId_(SHEETS.NOTIFICATION_TEMPLATES), code: body.code, name: body.name, channel: body.channel, subject: body.subject || '', body_template: body.body_template || '', variables: body.variables || '', is_active: true, created_at: now, updated_at: now };
  appendRow_(SHEETS.NOTIFICATION_TEMPLATES, template);
  logAudit_({ actorId: context.user.id, action: 'notification_template.create', resourceType: 'notification_template', resourceId: template.id, result: 'SUCCESS' });
  return template;
}

function updateNotificationTemplate_(id, body, context) {
  body = body || {};
  requirePermission_(context.user, 'notification', 'manage');
  if (!findRow_(SHEETS.NOTIFICATION_TEMPLATES, 'id', id)) throw new Error('Template tidak ditemukan.');
  var updates = {};
  ['name', 'channel', 'subject', 'body_template', 'variables', 'is_active'].forEach(function(f) { if (body[f] !== undefined) updates[f] = body[f]; });
  updates.updated_at = new Date().toISOString();
  updateRow_(SHEETS.NOTIFICATION_TEMPLATES, id, updates);
  logAudit_({ actorId: context.user.id, action: 'notification_template.update', resourceType: 'notification_template', resourceId: id, result: 'SUCCESS' });
  return findRow_(SHEETS.NOTIFICATION_TEMPLATES, 'id', id);
}

function listNotifications_(query, context) {
  query = query || {};
  requirePermission_(context.user, 'notification', 'read');
  var channelMap = {};
  readAll_(SHEETS.NOTIFICATION_DELIVERIES).forEach(function(d) { if (!channelMap[d.notification_id]) channelMap[d.notification_id] = d.channel; });
  var notifications = readAll_(SHEETS.NOTIFICATIONS).map(function(n) { var c = Object.assign({}, n); c.channel = channelMap[n.id] || 'email'; return c; });
  if (query.status) notifications = notifications.filter(function(n) { return n.status === query.status; });
  var page = parseInt(query.page, 10) || 1;
  var pageSize = parseInt(query.pageSize, 10) || 10;
  var total = notifications.length;
  return { data: notifications.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), meta: { total: total, page: page, pageSize: pageSize, totalPages: Math.ceil(total / pageSize) } };
}

function sendNotification_(body, context) {
  body = body || {};
  requirePermission_(context.user, 'notification', 'send');
  var recipients = body.recipients;
  if (!recipients || recipients.length === 0) throw new Error('Recipients wajib diisi.');
  if (recipients.length > MAX_NOTIFICATION_RECIPIENTS) throw new Error('Maksimal ' + MAX_NOTIFICATION_RECIPIENTS + ' penerima per request (tahap 1).');
  var template = null;
  if (body.template_code) {
    template = findRow_(SHEETS.NOTIFICATION_TEMPLATES, 'code', body.template_code);
    if (!template) throw new Error('Template tidak ditemukan.');
  }
  var channel = body.channel || (template ? template.channel : 'email');
  if (channel !== 'email') throw new Error('Channel "' + channel + '" belum aktif. Tahap 1 hanya email.'); // F10b
  var subject = body.subject || (template ? template.subject : '');
  var bodyText = body.body || (template ? template.body_template : '');
  if (template && template.variables) {
    template.variables.split(',').map(function(v) { return v.trim(); }).forEach(function(v) {
      bodyText = bodyText.replace(new RegExp('\\{\\{' + v + '\\}\\}', 'g'), (body.variables && body.variables[v]) ? body.variables[v] : '');
    });
  }
  var now = new Date().toISOString();
  var notif = { id: getNextId_(SHEETS.NOTIFICATIONS), template_id: template ? template.id : '', subject: subject, body: bodyText, priority: body.priority || 'normal', status: 'queued', scheduled_at: body.scheduled_at || now, created_by: context.user.id, created_at: now };
  appendRow_(SHEETS.NOTIFICATIONS, notif);
  recipients.forEach(function(recipient) {
    var recId = getNextId_(SHEETS.NOTIFICATION_RECIPIENTS); // UUID (F4)
    appendRow_(SHEETS.NOTIFICATION_RECIPIENTS, { id: recId, notification_id: notif.id, recipient_type: recipient.type || 'email', recipient_value: recipient.value, status: 'queued', created_at: now });
    appendRow_(SHEETS.NOTIFICATION_DELIVERIES, { id: getNextId_(SHEETS.NOTIFICATION_DELIVERIES), notification_id: notif.id, recipient_id: recId, channel: channel, provider_message_id: '', status: 'queued', sent_at: '', delivered_at: '', failed_at: '', error_message: '', attempt_count: 0 });
  });
  logAudit_({ actorId: context.user.id, action: 'notification.send', resourceType: 'notification', resourceId: notif.id, result: 'SUCCESS', metadata: { channel: channel, recipient_count: recipients.length } });
  return findRow_(SHEETS.NOTIFICATIONS, 'id', notif.id);
}

function getNotificationDetail_(id, context) {
  requirePermission_(context.user, 'notification', 'read');
  var notif = findRow_(SHEETS.NOTIFICATIONS, 'id', id);
  if (!notif) throw new Error('Notifikasi tidak ditemukan.');
  return { notification: notif, recipients: findAll_(SHEETS.NOTIFICATION_RECIPIENTS, { notification_id: id }), deliveries: findAll_(SHEETS.NOTIFICATION_DELIVERIES, { notification_id: id }) };
}

function listNotificationDeliveries_(id, context) {
  requirePermission_(context.user, 'notification', 'read');
  return { data: findAll_(SHEETS.NOTIFICATION_DELIVERIES, { notification_id: id }) };
}

function processNotificationQueue_() {
  var nowTs = Date.now();
  findAll_(SHEETS.NOTIFICATIONS, { status: 'queued' }).forEach(function(notif) {
    try {
      if (notif.scheduled_at && new Date(notif.scheduled_at).getTime() > nowTs) return; // belum waktunya
    } catch (e) {}
    var deliveries = findAll_(SHEETS.NOTIFICATION_DELIVERIES, { notification_id: notif.id });
    var allSent = true, anyFailed = false;
    deliveries.forEach(function(delivery) {
      if (delivery.channel === 'email' && (delivery.status === 'queued' || (delivery.status === 'failed' && Number(delivery.attempt_count || 0) < MAX_NOTIFICATION_RETRY))) {
        var recipient = findRow_(SHEETS.NOTIFICATION_RECIPIENTS, 'id', delivery.recipient_id);
        if (recipient && (recipient.status === 'queued' || recipient.status === 'failed')) {
          try {
            MailApp.sendEmail(recipient.recipient_value, notif.subject, notif.body);
            updateRow_(SHEETS.NOTIFICATION_DELIVERIES, delivery.id, { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: 'mail_sent', attempt_count: Number(delivery.attempt_count || 0) + 1 });
            updateRow_(SHEETS.NOTIFICATION_RECIPIENTS, recipient.id, { status: 'sent' });
          } catch (e) {
            anyFailed = true; allSent = false;
            updateRow_(SHEETS.NOTIFICATION_DELIVERIES, delivery.id, { status: 'failed', failed_at: new Date().toISOString(), error_message: String(e.message).substring(0, 500), attempt_count: Number(delivery.attempt_count || 0) + 1 });
            updateRow_(SHEETS.NOTIFICATION_RECIPIENTS, recipient.id, { status: 'failed' });
          }
        } else { allSent = false; }
      } else if (delivery.channel !== 'email') {
        allSent = false;
      } else if (delivery.status === 'failed' && Number(delivery.attempt_count || 0) >= MAX_NOTIFICATION_RETRY) {
        anyFailed = true; allSent = false;
      }
    });
    updateRow_(SHEETS.NOTIFICATIONS, notif.id, { status: anyFailed ? 'partial' : (allSent ? 'sent' : 'queued') });
  });
}

// ==================== HEALTH CHECK (publik — tanpa data sensitif) ====================
function healthCheck_() {
  var checks = {};
  try { getSpreadsheet_(); checks.spreadsheet = { status: 'OK' }; } catch (e) { checks.spreadsheet = { status: 'ERROR', message: e.message }; }
  try { DriveApp.getFolderById(getConfig_('DRIVE_ROOT_FOLDER_ID', DRIVE_ROOT_FOLDER_ID)); checks.drive = { status: 'OK' }; } catch (e) { checks.drive = { status: 'ERROR', message: e.message }; }
  try { checks.notificationQueue = { status: 'OK', queuedCount: findAll_(SHEETS.NOTIFICATIONS, { status: 'queued' }).length }; } catch (e) { checks.notificationQueue = { status: 'ERROR', message: e.message }; }
  var allOk = Object.keys(checks).every(function(k) { return checks[k].status === 'OK'; });
  return { status: allOk ? 'HEALTHY' : 'DEGRADED', checks: checks, timestamp: new Date().toISOString() };
}

// ==================== AUDIT HANDLER ====================
function listAuditEvents_(query, context) {
  query = query || {};
  requirePermission_(context.user, 'audit', 'read');
  var events = readAll_(SHEETS.AUDIT_EVENTS);
  ['actor_id', 'action', 'resource_type', 'resource_id', 'result'].forEach(function(f) {
    if (query[f]) events = events.filter(function(e) { return String(e[f]) === String(query[f]); });
  });
  if (query.search) {
    var q = String(query.search).toLowerCase();
    events = events.filter(function(e) {
      return [e.action, e.resource_type, e.resource_id, e.actor_id, e.result, e.metadata].some(function(val) { return String(val).toLowerCase().indexOf(q) !== -1; });
    });
  }
  if (query.sortBy && ['timestamp', 'action', 'actor_id', 'result'].indexOf(query.sortBy) !== -1) {
    var dir = query.sortOrder === 'desc' ? -1 : 1;
    events.sort(function(a, b) {
      var va = a[query.sortBy] || '', vb = b[query.sortBy] || '';
      if (query.sortBy === 'timestamp') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
      else { if (typeof va === 'string') va = va.toLowerCase(); if (typeof vb === 'string') vb = vb.toLowerCase(); }
      return va > vb ? dir : va < vb ? -dir : 0;
    });
  } else {
    events.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  }
  if (events.length > AUDIT_LIST_CAP) events = events.slice(0, AUDIT_LIST_CAP); // F9b
  var page = parseInt(query.page, 10) || 1;
  var pageSize = parseInt(query.pageSize, 10) || 50;
  var total = events.length;
  return { data: events.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), meta: { total: total, page: page, pageSize: pageSize, totalPages: Math.ceil(total / pageSize) } };
}

// ==================== DASHBOARD HANDLER ====================
function getDashboardStats_(context) {
  requirePermission_(context.user, 'dashboard', 'read');
  var dkey = 'dashboard_' + context.user.id; // F9c: cache 5 menit per user
  try {
    var hit = CacheService.getScriptCache().get(dkey);
    if (hit) return JSON.parse(hit);
  } catch (e) {}
  var hasAuditRead = hasPermission_(context.user, 'audit', 'read');
  var countRows = function(sheetName) {
    var data = getSheet_(sheetName).getDataRange().getValues();
    return data.slice(1).filter(function(row) { return row.some(function(cell) { return cell !== ''; }); }).length;
  };
  var auditEvents = hasAuditRead ? readAll_(SHEETS.AUDIT_EVENTS) : [];
  var result = {
    totalUsers: countRows(SHEETS.USERS),
    totalRoles: countRows(SHEETS.ROLES),
    totalPermissions: countRows(SHEETS.PERMISSIONS),
    totalFiles: countRows(SHEETS.FILES),
    totalNotifications: countRows(SHEETS.NOTIFICATIONS),
    totalAuditEvents: hasAuditRead ? countRows(SHEETS.AUDIT_EVENTS) : 0,
    chartData: hasAuditRead ? buildActivityChartData_(auditEvents) : { labels: [], datasets: [] },
    recentLogs: hasAuditRead ? auditEvents.slice().sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).slice(0, 5).map(function(ev) {
      return { id: ev.id, action: ev.action, resource_type: ev.resource_type, actor_id: ev.actor_id, result: ev.result, timestamp: ev.timestamp };
    }) : []
  };
  try { CacheService.getScriptCache().put(dkey, JSON.stringify(result), DASHBOARD_CACHE_SECONDS); } catch (e) {}
  return result;
}

function buildActivityChartData_(events) {
  var days = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  for (var i = 6; i >= 0; i--) { var d = new Date(today); d.setDate(today.getDate() - i); days.push(d); }
  return {
    labels: days.map(function(d) { return d.toLocaleDateString('id-ID', { weekday: 'short' }); }),
    datasets: [{
      label: 'Aktivitas',
      data: days.map(function(day) {
        var nextDay = new Date(day); nextDay.setDate(day.getDate() + 1);
        return events.filter(function(ev) { try { var ts = new Date(ev.timestamp); return ts >= day && ts < nextDay; } catch (e) { return false; } }).length;
      }),
      borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3
    }]
  };
}

// ==================== TIKET AKSES LINTAS APLIKASI ====================
function createAccessTicket_(userId, appCode, context) {
  var realUserId = userId || (context && context.user && context.user.id);
  if (!realUserId) throw new Error('User ID tidak valid.');
  if (appCode) { // warning jika app tak dikenal (tiket tetap dibuat; bisnis wajib verifikasi appCode)
    var known = readAll_(SHEETS.APPLICATIONS).some(function(a) { return String(a.code) === String(appCode) && String(a.status).toLowerCase() === 'active'; });
    if (!known) Logger.log('⚠️ createAccessTicket_: appCode "' + appCode + '" tidak terdaftar/aktif di Sheet applications.');
  }
  var ticket = 't_' + Utilities.getUuid() + '_' + Date.now();
  var now = new Date();
  var record = { id: getNextId_(SHEETS.TICKETS), ticket: ticket, user_id: String(realUserId), app_code: appCode || '', issued_at: now.toISOString(), expires_at: new Date(now.getTime() + TICKET_TTL_SECONDS * 1000).toISOString(), created_at: now.toISOString() };
  appendRow_(SHEETS.TICKETS, record);
  if (context && context.user) {
    try {
      logAudit_({ actorId: context.user.id, action: 'ticket.create', resourceType: 'auth', resourceId: ticket, result: 'SUCCESS', metadata: { appCode: appCode, requestedUserId: userId || 'self' } });
    } catch (e) {}
  }
  return { ticket: ticket, expires_in: TICKET_TTL_SECONDS };
}

// F3: perbandingan role_id pakai String() (sebelumnya ["1"].includes(1) = false).
function validateAppTicket_(ticket) {
  if (!ticket) throw new Error('Tiket tidak ada');
  var sheet = getSheet_(SHEETS.TICKETS);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) throw new Error('Tiket tidak valid atau kedaluwarsa');
  var headers = data[0];
  var record = null;
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
    if (obj.ticket === ticket) { record = obj; break; }
  }
  if (!record) throw new Error('Tiket tidak valid atau kedaluwarsa');
  if (new Date(record.expires_at) < new Date()) throw new Error('Tiket tidak valid atau kedaluwarsa');
  var user = findRow_(SHEETS.USERS, 'id', record.user_id);
  if (!user) throw new Error('User tidak ditemukan');
  if (user.status !== 'active') throw new Error('User tidak aktif');
  var userRoleIds = readAll_(SHEETS.USER_ROLES)
    .filter(function(ur) { return String(ur.user_id) === String(user.id); })
    .map(function(ur) { return String(ur.role_id); });
  user.roles = readAll_(SHEETS.ROLES)
    .filter(function(r) { return userRoleIds.indexOf(String(r.id)) !== -1; })
    .map(function(r) { return r.code; });
  var safe = stripSecret_(user);
  safe.roles = user.roles;
  return { user: safe, appCode: record.app_code };
}

// ==================== APLIKASI TERDAFTAR ====================
function listRegisteredApps_(query, context) {
  requirePermission_(context.user, 'application', 'read');
  var apps = readAll_(SHEETS.APPLICATIONS);
  if (apps.length === 0) {
    apps = REGISTERED_APPS.map(function(app) { return { code: app.code, name: app.name, description: app.description || '', url: app.url || '', status: 'active', icon: app.icon || '' }; });
  } else {
    apps = apps.filter(function(a) { return String(a.status).toLowerCase() === 'active'; })
      .map(function(app) { var c = Object.assign({}, app); c.url = app.redirect_uri || app.url || ''; c.icon = app.icon_url || app.icon || ''; return c; });
  }
  return { data: apps };
}

// ==================== ENTRY POINT HTTP ====================
function doGet(e) {
  var redirect = (e && e.parameter && e.parameter.redirect) || '';
  var html = HtmlService.createTemplateFromFile('Index');
  html.redirect = redirect;
  return html.evaluate()
    .setTitle('SI Platform - User Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// F2: token dibaca dari 3 tempat (body.token, body.data.token, ?token=) — sejajar dengan ticket.
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); }
      catch (err) { Logger.log('⚠️ doPost: body bukan JSON valid: ' + err.message); }
    }
    var method = (e.parameter && e.parameter.method) || body.method || '';
    var path = (e.parameter && e.parameter.path) || body.path || '';
    var ticket = (e.parameter && e.parameter.ticket) || (body.data && body.data.ticket) || body.ticket || '';
    var token = body.token || (body.data && body.data.token) || (e.parameter && e.parameter.token) || '';
    var request = { method: String(method).toUpperCase(), path: path, data: body.data || body || {}, query: e.parameter || {}, token: token };
    if (ticket) request.data.ticket = ticket;
    return ContentService.createTextOutput(JSON.stringify(handleApiRequest_(request))).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ doPost INTERNAL_ERROR: ' + error.message + '\n' + (error.stack || ''));
    return ContentService.createTextOutput(JSON.stringify({ success: false, data: null, meta: {}, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal. Cek log Executions Global.' } })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApiRequest_(request) {
  var method = request.method, path = request.path, data = request.data || {}, token = request.token;
  var query = request.query || {};
  var user = null;
  var requestContext = { ip: request.ip || '', user_agent: request.user_agent || '' };
  if (token) { try { user = getUserByToken_(token); } catch (e) { user = null; } }

  // ===== ENDPOINT PUBLIK (tanpa login) =====
  try {
    if (path === '/api/v1/health' && method === 'GET') return executeHandler_(function() { return healthCheck_(); }, null);
    if (path === '/api/v1/auth/validate-ticket' && method === 'POST') return executeHandler_(function() { return validateAppTicket_(data.ticket); }, null);
    if (path === '/api/v1/auth/login' && method === 'POST') return executeHandler_(function() { return loginUser_(data, requestContext); }, null);
  } catch (error) {
    return { success: false, data: null, meta: {}, error: { code: String(error.message).indexOf('FORBIDDEN') === 0 ? 'FORBIDDEN' : 'BAD_REQUEST', message: String(error.message).replace('FORBIDDEN: ', '') } };
  }

  // ===== ENDPOINT PRIVATE (wajib login) =====
  if (!user) return { success: false, data: null, meta: {}, error: { code: 'UNAUTHORIZED', message: 'Autentikasi diperlukan atau sesi berakhir.' } };
  var context = { user: user, token: token, requestId: Utilities.getUuid(), ip: requestContext.ip, user_agent: requestContext.user_agent };
  try {
    switch (true) {
      case path === '/api/v1/auth/session' && method === 'GET': return executeHandler_(function() { return getSession_(data, context); }, context);
      case path === '/api/v1/auth/logout' && method === 'POST': return executeHandler_(function() { return logoutUser_(data, context); }, context);
      case path === '/api/v1/auth/create-ticket' && method === 'POST': return executeHandler_(function() { return createAccessTicket_(context.user.id, data.appCode, context); }, context);
      case path === '/api/v1/apps' && method === 'GET': return executeHandler_(function() { return listRegisteredApps_(query, context); }, context);
      case path === '/api/v1/users' && method === 'GET': return executeHandler_(function() { return listUsers_(query, context); }, context);
      case path === '/api/v1/users' && method === 'POST': return executeHandler_(function() { return createUser_(data, context); }, context);
      case (/^\/api\/v1\/users\/[^/]+$/).test(path) && method === 'PATCH': {
        var userId = path.split('/').pop();
        return executeHandler_(function() { return updateUser_(userId, data, context); }, context);
      }
      case (/^\/api\/v1\/users\/[^/]+$/).test(path) && method === 'DELETE': {
        var userId2 = path.split('/').pop();
        return executeHandler_(function() { return deleteUser_(userId2, context); }, context);
      }
      case (/^\/api\/v1\/users\/[^/]+\/roles$/).test(path) && method === 'POST': {
        var userId3 = path.split('/')[4];
        return executeHandler_(function() { return assignRolesToUser_(userId3, data, context); }, context);
      }
      case (/^\/api\/v1\/users\/[^/]+\/roles\/[^/]+$/).test(path) && method === 'DELETE': {
        var parts = path.split('/');
        return executeHandler_(function() { return removeRoleFromUser_(parts[4], parts[6], context); }, context);
      }
      case path === '/api/v1/roles' && method === 'GET': return executeHandler_(function() { return listRoles_(query, context); }, context);
      case path === '/api/v1/roles' && method === 'POST': return executeHandler_(function() { return createRole_(data, context); }, context);
      case (/^\/api\/v1\/roles\/[^/]+$/).test(path) && method === 'PATCH': {
        var roleId = path.split('/').pop();
        return executeHandler_(function() { return updateRole_(roleId, data, context); }, context);
      }
      case path === '/api/v1/permissions' && method === 'GET': return executeHandler_(function() { return listPermissions_(query, context); }, context);
      case (/^\/api\/v1\/roles\/[^/]+\/permissions$/).test(path) && method === 'POST': {
        var roleId2 = path.split('/')[4];
        return executeHandler_(function() { return assignPermissionsToRole_(roleId2, data, context); }, context);
      }
      case (/^\/api\/v1\/roles\/[^/]+\/permissions\/[^/]+$/).test(path) && method === 'DELETE': {
        var parts2 = path.split('/');
        return executeHandler_(function() { return removePermissionFromRole_(parts2[4], parts2[6], context); }, context);
      }
      case path === '/api/v1/settings' && method === 'GET': return executeHandler_(function() { return listSettings_(query, context); }, context);
      case (/^\/api\/v1\/settings\/[^/]+$/).test(path) && method === 'GET': {
        var key = path.split('/').pop();
        return executeHandler_(function() { return getSettingByKey_(key, context); }, context);
      }
      case (/^\/api\/v1\/settings\/[^/]+$/).test(path) && method === 'PATCH': {
        var key2 = path.split('/').pop();
        return executeHandler_(function() { return updateSetting_(key2, data, context); }, context);
      }
      case (/^\/api\/v1\/settings\/[^/]+\/history$/).test(path) && method === 'GET': {
        var key3 = path.split('/')[4];
        return executeHandler_(function() { return getSettingHistory_(key3, context); }, context);
      }
      case path === '/api/v1/folders' && method === 'GET': return executeHandler_(function() { return listFolders_(query, context); }, context);
      case path === '/api/v1/folders' && method === 'POST': return executeHandler_(function() { return createFolder_(data, context); }, context);
      case path === '/api/v1/files' && method === 'GET': return executeHandler_(function() { return listFiles_(query, context); }, context);
      case path === '/api/v1/files' && method === 'POST': return executeHandler_(function() { return uploadFile_(data, context); }, context);
      case (/^\/api\/v1\/files\/[^/]+\/versions$/).test(path) && method === 'GET': {
        var fileId = path.split('/')[4];
        return executeHandler_(function() { return listFileVersions_(fileId, context); }, context);
      }
      case (/^\/api\/v1\/files\/[^/]+\/download$/).test(path) && method === 'GET': {
        var fileId2 = path.split('/')[4];
        return executeHandler_(function() { return downloadFile_(fileId2, context); }, context);
      }
      case (/^\/api\/v1\/files\/[^/]+$/).test(path) && method === 'DELETE': {
        var fileId3 = path.split('/')[4];
        return executeHandler_(function() { return deleteFile_(fileId3, context); }, context);
      }
      case path === '/api/v1/audit/events' && method === 'GET': return executeHandler_(function() { return listAuditEvents_(query, context); }, context);
      case path === '/api/v1/dashboard/stats' && method === 'GET': return executeHandler_(function() { return getDashboardStats_(context); }, context);
      case path === '/api/v1/notification-templates' && method === 'GET': return executeHandler_(function() { return listNotificationTemplates_(query, context); }, context);
      case path === '/api/v1/notification-templates' && method === 'POST': return executeHandler_(function() { return createNotificationTemplate_(data, context); }, context);
      case (/^\/api\/v1\/notification-templates\/[^/]+$/).test(path) && method === 'PATCH': {
        var templateId = path.split('/').pop();
        return executeHandler_(function() { return updateNotificationTemplate_(templateId, data, context); }, context);
      }
      case path === '/api/v1/notifications' && method === 'GET': return executeHandler_(function() { return listNotifications_(query, context); }, context);
      case path === '/api/v1/notifications' && method === 'POST': return executeHandler_(function() { return sendNotification_(data, context); }, context);
      case (/^\/api\/v1\/notifications\/[^/]+$/).test(path) && method === 'GET': {
        var notifId = path.split('/')[4];
        return executeHandler_(function() { return getNotificationDetail_(notifId, context); }, context);
      }
      case (/^\/api\/v1\/notifications\/[^/]+\/deliveries$/).test(path) && method === 'GET': {
        var notifId2 = path.split('/')[4];
        return executeHandler_(function() { return listNotificationDeliveries_(notifId2, context); }, context);
      }
      default:
        return { success: false, data: null, meta: {}, error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } };
    }
  } catch (error) {
    return { success: false, data: null, meta: { requestId: context.requestId }, error: { code: String(error.message).indexOf('FORBIDDEN') === 0 ? 'FORBIDDEN' : 'BAD_REQUEST', message: String(error.message).replace('FORBIDDEN: ', '') } };
  }
}

function executeHandler_(handlerFn, context) {
  try {
    var result = handlerFn();
    return { success: true, data: (result && result.data !== undefined) ? result.data : result, meta: (result && result.meta) || {}, error: null };
  } catch (error) {
    if (context) {
      try {
        logAudit_({ actorId: context.user.id, action: 'handler.error', resourceType: 'endpoint', resourceId: context.requestId, result: 'FAILED', metadata: { message: String(error.message).substring(0, 500) } });
      } catch (auditErr) { Logger.log('⚠️ Gagal tulis audit error: ' + auditErr.message); }
    }
    throw error;
  }
}

function callApi(method, path, data, query) {
  var d = data || {};
  return handleApiRequest_({ method: method, path: path, data: d, query: query || {}, token: d.token || '' });
}

// Jembatan google.script.run untuk frontend.
function generateAppRedirectUrl(appCode, platformSessionToken) {
  try {
    var user = getUserByToken_(platformSessionToken);
    if (!user) throw new Error('Sesi PLATFORM telah berakhir. Silakan login kembali.');
    var result = createAccessTicket_(user.id, appCode, { user: user });
    var registeredApps = readAll_(SHEETS.APPLICATIONS);
    var appInfo = null;
    for (var i = 0; i < registeredApps.length; i++) {
      if (String(registeredApps[i].code) === String(appCode)) { appInfo = registeredApps[i]; break; }
    }
    if (!appInfo) {
      for (var j = 0; j < REGISTERED_APPS.length; j++) {
        if (REGISTERED_APPS[j].code === appCode) { appInfo = REGISTERED_APPS[j]; break; }
      }
    }
    if (!appInfo) throw new Error('Aplikasi ' + appCode + ' tidak terdaftar di sistem.');
    if (appInfo.status && String(appInfo.status).toLowerCase() !== 'active') throw new Error('Aplikasi ' + appCode + ' sedang nonaktif.');
    var appUrl = appInfo.redirect_uri || appInfo.url;
    if (!appUrl || String(appUrl).trim() === '') throw new Error('URL Aplikasi ' + appCode + ' belum dikonfigurasi.');
    return { success: true, redirectUrl: appUrl + '?ticket=' + encodeURIComponent(result.ticket) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
