// ============================================================
// SI-PLATFORM - 02_AuthEngine.gs
// SSO Auth Engine, Ticket Issuing, Validation & Profile Enrichment
// ============================================================

/**
 * Mendapatkan detail pengguna berdasarkan email dari database USERS dan SIMPEG PEGAWAI.
 */
function findUserByEmail_(email) {
  var cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return null;

  var users = readRecordsNoLock_('USERS').filter(function(u) { return !u.deleted_at; });
  var matchedUser = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email || '').toLowerCase().trim() === cleanEmail) {
      matchedUser = Object.assign({}, users[i]);
      break;
    }
  }

  // Jika belum terdaftar di USERS, coba cari di master PEGAWAI
  var pegawaiList = readRecordsNoLock_('PEGAWAI').filter(function(p) { return !p.deleted_at; });
  var matchedPegawai = null;
  for (var j = 0; j < pegawaiList.length; j++) {
    if (String(pegawaiList[j].email || '').toLowerCase().trim() === cleanEmail) {
      matchedPegawai = pegawaiList[j];
      break;
    }
  }

  if (!matchedUser && !matchedPegawai) {
    return null;
  }

  var finalUser = matchedUser || {
    id: CoreLib.makeId('usr'),
    email: cleanEmail,
    nama: matchedPegawai ? matchedPegawai.nama : cleanEmail.split('@')[0],
    nip: matchedPegawai ? matchedPegawai.nip : '',
    role: 'user',
    status: 'AKTIF'
  };

  if (matchedPegawai) {
    finalUser.pegawai_id = matchedPegawai.id;
    finalUser.nip = matchedPegawai.nip || finalUser.nip;
    finalUser.nama = matchedPegawai.nama || finalUser.nama;
    finalUser.unit_id = matchedPegawai.unit_id || '';
    finalUser.jabatan_id = matchedPegawai.jabatan_id || '';
    finalUser.pangkat_golongan = matchedPegawai.pangkat_golongan || '';
  }

  return finalUser;
}

/**
 * Membuat Tiket SSO baru untuk aplikasi target.
 */
function createPlatformTicket(user, targetAppCode) {
  if (!user || !user.email) throw new Error('User payload tidak valid.');

  var ticketId = CoreLib.makeId('tkt');
  var cache = CacheService.getScriptCache();
  var ticketPayload = {
    ticket: ticketId,
    email: String(user.email).toLowerCase().trim(),
    nama: user.nama || '',
    nip: user.nip || '',
    role: user.role || 'user',
    pegawai_id: user.pegawai_id || '',
    unit_id: user.unit_id || '',
    jabatan_id: user.jabatan_id || '',
    target_app: String(targetAppCode || '').toUpperCase().trim(),
    created_at: CoreLib.nowIso()
  };

  cache.put(TICKET_PREFIX + ticketId, JSON.stringify(ticketPayload), TICKET_TTL_SECONDS);
  return ticketId;
}

/**
 * Memvalidasi Tiket SSO yang dikirimkan oleh aplikasi konsumen.
 * Tiket bersifat single-use (dihapus setelah divalidasi).
 */
function validateTicket_(ticketId, requestedAppCode) {
  if (!ticketId) return { success: false, error: 'Ticket ID tidak disediakan.' };

  var cache = CacheService.getScriptCache();
  var raw = cache.get(TICKET_PREFIX + ticketId);
  if (!raw) {
    return { success: false, error: 'Tiket tidak valid atau sudah kedaluwarsa.' };
  }

  // Hapus tiket agar single-use (anti-replay attack)
  cache.remove(TICKET_PREFIX + ticketId);

  var payload = {};
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return { success: false, error: 'Format tiket rusak.' };
  }

  // Validasi app target bila ditentukan
  if (payload.target_app && requestedAppCode) {
    if (payload.target_app !== String(requestedAppCode).toUpperCase().trim()) {
      return { success: false, error: 'Tiket tidak diperuntukkan bagi aplikasi ini.' };
    }
  }

  // Lengkapi dengan data pegawai terbaru dari SIMPEG
  var enrichedUser = findUserByEmail_(payload.email);

  return {
    success: true,
    data: {
      email: payload.email,
      nama: enrichedUser ? enrichedUser.nama : payload.nama,
      nip: enrichedUser ? enrichedUser.nip : payload.nip,
      role: enrichedUser ? enrichedUser.role : payload.role,
      pegawai_id: enrichedUser ? enrichedUser.pegawai_id : payload.pegawai_id,
      unit_id: enrichedUser ? enrichedUser.unit_id : payload.unit_id,
      jabatan_id: enrichedUser ? enrichedUser.jabatan_id : payload.jabatan_id,
      pangkat_golongan: enrichedUser ? enrichedUser.pangkat_golongan : ''
    }
  };
}

/**
 * Otentikasi Sesi Portal SI-Platform
 */
function authenticatePortalSession_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get(SESSION_PREFIX + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function createPortalSession_(user) {
  var token = CoreLib.makeId('ses');
  var cache = CacheService.getScriptCache();
  cache.put(SESSION_PREFIX + token, JSON.stringify(user), SESSION_TTL_SECONDS);
  return token;
}
