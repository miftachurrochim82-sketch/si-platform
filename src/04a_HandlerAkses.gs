// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 4a: HANDLER AKSES (USER, ROLE, PERMISSION) ====================
// Pecahan dari 04_HandlerAndRouter.gs (Track C, 2026-09-17). Isi TIDAK diubah.

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
