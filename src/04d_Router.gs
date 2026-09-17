// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 4d: ROUTER & ENTRY POINT (TIKET, APPS, doGet/doPost) ====================
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
      .map(function(app) {
        var c = Object.assign({}, app);
        var rawUrl = String(app.redirect_uri || app.url || '').replace(/^[+\s]+|[+\s]+$/g, '').trim();
        c.url = rawUrl;
        c.icon = app.icon_url || app.icon || '';
        return c;
      });
  }
  return { data: apps };
}

// ==================== ENTRY POINT HTTP ====================
function doGet(e) {
  var redirect = (e && e.parameter && e.parameter.redirect) || '';
  var html;
  try {
    html = HtmlService.createTemplateFromFile('Index');
  } catch (err) {
    html = HtmlService.createTemplateFromFile('index');
  }
  html.redirect = redirect;
  return html.evaluate()
    .setTitle('SI Platform - User Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  try {
    return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  } catch (err) {
    return HtmlService.createTemplateFromFile(filename.toLowerCase()).evaluate().getContent();
  }
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
