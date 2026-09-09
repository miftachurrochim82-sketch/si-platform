// ============================================================
// SI-PLATFORM - 04_PortalRouter.gs
// Entrypoint doGet, doPost, & Universal API Action Dispatcher
// ============================================================

/**
 * Web App Entrypoint (SSO Portal & Launcher)
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.sessionToken = '';
  template.user = {};
  return template.evaluate()
    .setTitle(APP_TITLE + ' — Portal SSO & Master Data Pemkab Trenggalek')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * API Endpoint for Consumer Apps & Portal AJAX
 */
function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return CoreLib.jsonResponse({ success: false, code: 'BAD_REQUEST', error: 'Format JSON payload tidak valid.' });
  }

  var result = handlePlatformAction(body);
  return CoreLib.jsonResponse(result);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Dispatcher Aksi SI-Platform
 */
function handlePlatformAction(payload) {
  var action = payload.action || '';
  var data = payload.data || payload;
  var token = payload.token || (data && data.token) || '';

  // 1. Aksi Publik / SSO Gateway (Tanpa Token Sesi Portal)
  if (action === 'validate_ticket' || action === 'exchange_ticket') {
    var ticket = data.ticket || data.ticketId || '';
    var appCode = data.appCode || data.app_code || '';
    return validateTicket_(ticket, appCode);
  }

  if (action === 'login_google' || action === 'portal_login') {
    var email = data.email || (function() {
      try { return Session.getActiveUser().getEmail(); } catch(e) { return ''; }
    })();
    var user = findUserByEmail_(email);
    if (!user) {
      return { success: false, error: 'Akun ' + email + ' belum terdaftar di SIMPEG atau SI-Platform.' };
    }
    var sessionToken = createPortalSession_(user);
    return {
      success: true,
      token: sessionToken,
      user: user
    };
  }

  // 2. Autentikasi Sesi Portal
  var currentUser = authenticatePortalSession_(token);
  if (!currentUser) {
    // Fallback bila user membuka via GAS langsung dengan identitas Google aktif
    try {
      var actEmail = Session.getActiveUser().getEmail();
      if (actEmail) currentUser = findUserByEmail_(actEmail);
    } catch (e) {}
  }

  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Sesi portal Anda telah berakhir. Silakan login kembali.' };
  }

  // 3. Routing Aksi Terotentikasi
  switch (action) {
    case 'get_platform_stats':
      return getPlatformStats_(data, currentUser);

    case 'get_app_list':
      return getAppRegistryList_(data, currentUser);

    case 'save_app_item':
      if (currentUser.role !== 'admin' && currentUser.role !== 'super') {
        return { success: false, error: 'Akses ditolak: Hanya admin yang dapat mengubah aplikasi.' };
      }
      return saveAppRegistryItem_(data, currentUser);

    case 'get_pegawai_list':
    case 'get_master_pegawai':
      return getMasterPegawaiList_(data, currentUser);

    case 'save_pegawai':
      if (currentUser.role !== 'admin' && currentUser.role !== 'super') {
        return { success: false, error: 'Akses ditolak.' };
      }
      return saveMasterPegawai_(data, currentUser);

    case 'get_unit_list':
    case 'get_master_unit':
      return getMasterUnitList_(data, currentUser);

    case 'save_unit':
      if (currentUser.role !== 'admin' && currentUser.role !== 'super') {
        return { success: false, error: 'Akses ditolak.' };
      }
      return saveMasterUnit_(data, currentUser);

    case 'get_jabatan_list':
    case 'get_master_jabatan':
      return getMasterJabatanList_(data, currentUser);

    case 'save_jabatan':
      if (currentUser.role !== 'admin' && currentUser.role !== 'super') {
        return { success: false, error: 'Akses ditolak.' };
      }
      return saveMasterJabatan_(data, currentUser);

    case 'create_ticket':
      var targetApp = data.target_app || data.appCode || '';
      try {
        var tkt = createPlatformTicket(currentUser, targetApp);
        return { success: true, ticket: tkt };
      } catch (err) {
        return { success: false, error: err.message };
      }

    case 'portal_logout':
      var cache = CacheService.getScriptCache();
      if (token) cache.remove(SESSION_PREFIX + token);
      return { success: true, message: 'Logout berhasil.' };

    default:
      return { success: false, code: 'NOT_FOUND', error: 'Aksi "' + action + '" tidak dikenali di SI-Platform.' };
  }
}
