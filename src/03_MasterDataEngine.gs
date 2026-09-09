// ============================================================
// SI-PLATFORM - 03_MasterDataEngine.gs
// Master Data Management (Pegawai, Jabatan, Unit Kerja, Apps, Users)
// ============================================================

/**
 * Mendapatkan daftar seluruh pegawai (SIMPEG)
 */
function getMasterPegawaiList_(query, actor) {
  var rows = readRecordsNoLock_('PEGAWAI').filter(function(r) { return !r.deleted_at; });
  return { success: true, data: rows };
}

/**
 * Mendapatkan daftar unit kerja (SIMPEG)
 */
function getMasterUnitList_(query, actor) {
  var rows = readRecordsNoLock_('UNIT_KERJA').filter(function(r) { return !r.deleted_at; });
  return { success: true, data: rows };
}

/**
 * Mendapatkan daftar jabatan (SIMPEG)
 */
function getMasterJabatanList_(query, actor) {
  var rows = readRecordsNoLock_('JABATAN').filter(function(r) { return !r.deleted_at; });
  return { success: true, data: rows };
}

/**
 * Mendapatkan daftar aplikasi terdaftar di portal
 */
function getAppRegistryList_(query, actor) {
  var rows = readRecordsNoLock_('APLIKASI').filter(function(r) { return !r.deleted_at; });
  rows.sort(function(a, b) {
    return (parseInt(a.urutan || 99, 10)) - (parseInt(b.urutan || 99, 10));
  });
  return { success: true, data: rows };
}

/**
 * Simpan / update entri aplikasi di App Registry
 */
function saveAppRegistryItem_(data, actor) {
  if (!data || !data.record) return { success: false, error: 'Payload tidak valid.' };
  var item = Object.assign({}, data.record);
  if (!item.id) item.id = CoreLib.makeId('app');
  var isUpdate = Boolean(item.id && readRecordsNoLock_('APLIKASI').some(function(a) { return a.id === item.id; }));
  
  var saved = writeRecordNoLock_('APLIKASI', item, isUpdate, actor, 'id');
  invalidateCache_('APLIKASI');
  return { success: true, data: saved };
}

/**
 * Simpan data pegawai (Master SIMPEG)
 */
function saveMasterPegawai_(data, actor) {
  if (!data || !data.record) return { success: false, error: 'Payload record tidak valid.' };
  var item = Object.assign({}, data.record);
  if (!item.id) item.id = CoreLib.makeId('peg');
  var isUpdate = Boolean(item.id && readRecordsNoLock_('PEGAWAI').some(function(p) { return p.id === item.id; }));

  var saved = writeRecordNoLock_('PEGAWAI', item, isUpdate, actor, 'id');
  invalidateCache_('PEGAWAI');
  return { success: true, data: saved };
}

/**
 * Simpan data unit kerja (Master SIMPEG)
 */
function saveMasterUnit_(data, actor) {
  if (!data || !data.record) return { success: false, error: 'Payload record tidak valid.' };
  var item = Object.assign({}, data.record);
  if (!item.id) item.id = CoreLib.makeId('unt');
  var isUpdate = Boolean(item.id && readRecordsNoLock_('UNIT_KERJA').some(function(u) { return u.id === item.id; }));

  var saved = writeRecordNoLock_('UNIT_KERJA', item, isUpdate, actor, 'id');
  invalidateCache_('UNIT_KERJA');
  return { success: true, data: saved };
}

/**
 * Simpan data jabatan (Master SIMPEG)
 */
function saveMasterJabatan_(data, actor) {
  if (!data || !data.record) return { success: false, error: 'Payload record tidak valid.' };
  var item = Object.assign({}, data.record);
  if (!item.id) item.id = CoreLib.makeId('jab');
  var isUpdate = Boolean(item.id && readRecordsNoLock_('JABATAN').some(function(j) { return j.id === item.id; }));

  var saved = writeRecordNoLock_('JABATAN', item, isUpdate, actor, 'id');
  invalidateCache_('JABATAN');
  return { success: true, data: saved };
}

/**
 * Dashboard Statistik Portal SI-Platform
 */
function getPlatformStats_(query, actor) {
  var pegawai = getMasterPegawaiList_({}, actor).data || [];
  var unit = getMasterUnitList_({}, actor).data || [];
  var jabatan = getMasterJabatanList_({}, actor).data || [];
  var apps = getAppRegistryList_({}, actor).data || [];

  return {
    success: true,
    data: {
      total_pegawai: pegawai.length,
      total_unit: unit.length,
      total_jabatan: jabatan.length,
      total_aplikasi: apps.length,
      aplikasi_list: apps,
      generated_at: CoreLib.nowIso()
    }
  };
}
