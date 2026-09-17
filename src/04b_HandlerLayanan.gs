// ==================== SI-PLATFORM GLOBAL v2.0 — FILE 4b: HANDLER LAYANAN (FILE, FOLDER, NOTIFIKASI) ====================
// Pecahan dari 04_HandlerAndRouter.gs (Track C, 2026-09-17). Isi TIDAK diubah.

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
