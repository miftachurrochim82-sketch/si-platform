// ============================================================
// SI-PLATFORM - 05_SeedMasterData.gs
// Seeder Database Master SIMPEG & Registry Aplikasi Pemkab Trenggalek
// ============================================================

function seedMasterPlatform() {
  var ss = getDb_();
  var headers = getAllHeaders_();

  // 1. Pastikan seluruh sheet master tersedia
  Object.keys(headers).forEach(function(sheetName) {
    CoreLib.ensureSheet(SPREADSHEET_ID, sheetName, headers);
  });

  var actor = { email: 'system@trenggalekkab.go.id', role: 'super', username: 'System Seeder' };

  // 2. Data Unit Kerja (OPD Trenggalek)
  var existingUnits = readRecordsNoLock_('UNIT_KERJA');
  if (!existingUnits.length) {
    var units = [
      { id: 'unt_setda', kode_unit: 'SETDA', nama_unit: 'Sekretariat Daerah', jenis_unit: 'Sekretariat', status: 'AKTIF' },
      { id: 'unt_bkpsdm', kode_unit: 'BKPSDM', nama_unit: 'Badan Kepegawaian dan Pengembangan SDM', jenis_unit: 'Badan', status: 'AKTIF' },
      { id: 'unt_diskominfo', kode_unit: 'DISKOMINFO', nama_unit: 'Dinas Komunikasi dan Informatika', jenis_unit: 'Dinas', status: 'AKTIF' },
      { id: 'unt_inspektorat', kode_unit: 'INSPEKTORAT', nama_unit: 'Inspektorat Daerah', jenis_unit: 'Inspektorat', status: 'AKTIF' },
      { id: 'unt_bappeda', kode_unit: 'BAPPEDA', nama_unit: 'Badan Perencanaan Pembangunan Daerah', jenis_unit: 'Badan', status: 'AKTIF' },
      { id: 'unt_dinkes', kode_unit: 'DINKES', nama_unit: 'Dinas Kesehatan, Pengendalian Penduduk dan KB', jenis_unit: 'Dinas', status: 'AKTIF' },
      { id: 'unt_dikpora', kode_unit: 'DIKPORA', nama_unit: 'Dinas Pendidikan, Pemuda dan Olahraga', jenis_unit: 'Dinas', status: 'AKTIF' }
    ];
    units.forEach(function(u) { writeRecordNoLock_('UNIT_KERJA', u, false, actor, 'id'); });
  }

  // 3. Data Jabatan
  var existingJabs = readRecordsNoLock_('JABATAN');
  if (!existingJabs.length) {
    var jabatans = [
      { id: 'jab_kaban_bkpsdm', kode_jabatan: 'JAB-001', nama_jabatan: 'Kepala BKPSDM', unit_id: 'unt_bkpsdm', jenis_jabatan: 'Struktural', status_jabatan: 'DEFINITIF' },
      { id: 'jab_kadis_kominfo', kode_jabatan: 'JAB-002', nama_jabatan: 'Kepala Dinas Kominfo', unit_id: 'unt_diskominfo', jenis_jabatan: 'Struktural', status_jabatan: 'DEFINITIF' },
      { id: 'jab_pranata_komputer', kode_jabatan: 'JAB-003', nama_jabatan: 'Pranata Komputer Ahli Muda', unit_id: 'unt_diskominfo', jenis_jabatan: 'Fungsional', status_jabatan: 'DEFINITIF' },
      { id: 'jab_analis_sdm', kode_jabatan: 'JAB-004', nama_jabatan: 'Analis SDM Aparatur Ahli Muda', unit_id: 'unt_bkpsdm', jenis_jabatan: 'Fungsional', status_jabatan: 'DEFINITIF' },
      { id: 'jab_auditor_muda', kode_jabatan: 'JAB-005', nama_jabatan: 'Auditor Ahli Muda', unit_id: 'unt_inspektorat', jenis_jabatan: 'Fungsional', status_jabatan: 'DEFINITIF' }
    ];
    jabatans.forEach(function(j) { writeRecordNoLock_('JABATAN', j, false, actor, 'id'); });
  }

  // 4. Data Pegawai SIMPEG
  var existingPegs = readRecordsNoLock_('PEGAWAI');
  if (!existingPegs.length) {
    var pegawais = [
      {
        id: 'peg_admin_kominfo',
        nip: '198501012010011001',
        nama: 'Ahmad Fauzi, S.Kom',
        email: 'ahmad.fauzi@trenggalekkab.go.id',
        unit_id: 'unt_diskominfo',
        jabatan_id: 'jab_pranata_komputer',
        status: 'AKTIF',
        pangkat_golongan: 'Penata Tk. I (III/d)',
        alamat: 'Jl. Ahmad Yani No. 12, Trenggalek',
        no_hp: '081234567890'
      },
      {
        id: 'peg_admin_bkpsdm',
        nip: '198805122011012003',
        nama: 'Siti Nurhaliza, S.STP',
        email: 'siti.nurhaliza@trenggalekkab.go.id',
        unit_id: 'unt_bkpsdm',
        jabatan_id: 'jab_analis_sdm',
        status: 'AKTIF',
        pangkat_golongan: 'Penata (III/c)',
        alamat: 'Jl. Supriyadi No. 45, Trenggalek',
        no_hp: '081234567891'
      },
      {
        id: 'peg_auditor_insp',
        nip: '199002152014021002',
        nama: 'Budi Santoso, S.E., M.M.',
        email: 'budi.santoso@trenggalekkab.go.id',
        unit_id: 'unt_inspektorat',
        jabatan_id: 'jab_auditor_muda',
        status: 'AKTIF',
        pangkat_golongan: 'Penata (III/c)',
        alamat: 'Jl. Panglima Sudirman No. 88, Trenggalek',
        no_hp: '081234567892'
      }
    ];
    pegawais.forEach(function(p) { writeRecordNoLock_('PEGAWAI', p, false, actor, 'id'); });
  }

  // 5. Data Aplikasi Terdaftar di Portal
  var existingApps = readRecordsNoLock_('APLIKASI');
  if (!existingApps.length) {
    var apps = [
      {
        id: 'app_sipelaporan',
        kode_app: 'SIPELAPORAN',
        nama_app: 'SI-PELAPORAN',
        url_exec: 'https://script.google.com/macros/s/AKfycbz_sipelaporan_demo/exec',
        icon: 'fa-solid fa-file-shield',
        deskripsi: 'Sistem Informasi Pelaporan Pegawai Terintegrasi SIMPEG Pemkab Trenggalek.',
        urutan: 1,
        status: 'AKTIF'
      },
      {
        id: 'app_sidilan',
        kode_app: 'SIDILAN',
        nama_app: 'SI-DILAN',
        url_exec: 'https://script.google.com/macros/s/AKfycbz_sidilan_demo/exec',
        icon: 'fa-solid fa-graduation-cap',
        deskripsi: 'Sistem Informasi Pendidikan dan Pelatihan ASN Terintegrasi.',
        urutan: 2,
        status: 'AKTIF'
      },
      {
        id: 'app_sikompetensi',
        kode_app: 'SIKOMPETENSI',
        nama_app: 'SI-KOMPETENSI',
        url_exec: 'https://script.google.com/macros/s/AKfycbz_sikompetensi_demo/exec',
        icon: 'fa-solid fa-award',
        deskripsi: 'Sistem Penilaian Uji Kompetensi dan Pemetaan Talenta ASN.',
        urutan: 3,
        status: 'AKTIF'
      }
    ];
    apps.forEach(function(a) { writeRecordNoLock_('APLIKASI', a, false, actor, 'id'); });
  }

  // 6. Data Users
  var existingUsers = readRecordsNoLock_('USERS');
  if (!existingUsers.length) {
    var users = [
      { id: 'usr_super', email: 'miftachurrochim82@gmail.com', nama: 'Miftachurrochim', nip: '198201012005011001', role: 'super', status: 'AKTIF' },
      { id: 'usr_admin', email: 'ahmad.fauzi@trenggalekkab.go.id', nama: 'Ahmad Fauzi', nip: '198501012010011001', role: 'admin', status: 'AKTIF' },
      { id: 'usr_siti', email: 'siti.nurhaliza@trenggalekkab.go.id', nama: 'Siti Nurhaliza', nip: '198805122011012003', role: 'user', status: 'AKTIF' }
    ];
    users.forEach(function(u) { writeRecordNoLock_('USERS', u, false, actor, 'id'); });
  }

  Logger.log('[SI-PLATFORM] Seeder berhasil dijalankan.');
  return { success: true, message: 'Database Master SI-Platform & SIMPEG berhasil di-seed.' };
}
