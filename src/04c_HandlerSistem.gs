// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 4c: HANDLER SISTEM (SETTING, HEALTH, AUDIT, DASHBOARD) ====================
// Pecahan dari 04_HandlerAndRouter.gs (Track C, 2026-09-17). Isi TIDAK diubah.

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
