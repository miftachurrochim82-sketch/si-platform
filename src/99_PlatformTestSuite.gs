// ============================================================
// SI-PLATFORM - 99_PlatformTestSuite.gs
// Automated Diagnostic & SSO Integrity Test Suite
// ============================================================

function runPlatformDiagnostics() {
  var results = [];
  function pass(t, d) { results.push({ name: t, pass: true, detail: d || '' }); }
  function fail(t, d) { results.push({ name: t, pass: false, detail: d || '' }); }

  try {
    // 1. Uji Database Spreadsheet & Header
    var headers = getAllHeaders_();
    var sheetsOk = Object.keys(headers).length >= 5;
    if (sheetsOk) pass('T1: Schema Master Sheets', 'Tersedia ' + Object.keys(headers).length + ' skema sheet.');
    else fail('T1: Schema Master Sheets', 'Skema sheet tidak lengkap.');

    // 2. Uji Buat & Validasi Tiket SSO
    var dummyUser = { email: 'test.user@trenggalekkab.go.id', nama: 'Test User', nip: '199901012020011001', role: 'user' };
    var ticket = createPlatformTicket(dummyUser, 'SIPELAPORAN');
    if (ticket && ticket.length > 5) pass('T2: SSO Ticket Generation', 'Tiket berhasil diterbitkan: ' + ticket);
    else fail('T2: SSO Ticket Generation', 'Gagal menerbitkan tiket SSO.');

    // 3. Uji Validasi Tiket (Single Use)
    var valRes = validateTicket_(ticket, 'SIPELAPORAN');
    if (valRes && valRes.success && valRes.data.email === dummyUser.email) {
      pass('T3: SSO Ticket Validation', 'Tiket valid dan dikonsumsi dengan aman.');
    } else {
      fail('T3: SSO Ticket Validation', (valRes && valRes.error) || 'Validasi tiket gagal.');
    }

    // 4. Uji Anti-Replay (Tiket yang sudah divalidasi tidak boleh bisa dipakai lagi)
    var replayRes = validateTicket_(ticket, 'SIPELAPORAN');
    if (!replayRes.success) {
      pass('T4: SSO Anti-Replay Guard', 'Tiket bekas pakai berhasil ditolak: ' + replayRes.error);
    } else {
      fail('T4: SSO Anti-Replay Guard', 'Kerentanan terdeteksi: tiket bekas dapat divalidasi ulang!');
    }

    // 5. Uji Query Master SIMPEG
    var pegRes = getMasterPegawaiList_({}, dummyUser);
    var unitRes = getMasterUnitList_({}, dummyUser);
    var jabRes = getMasterJabatanList_({}, dummyUser);
    var appRes = getAppRegistryList_({}, dummyUser);

    if (pegRes.success && unitRes.success && jabRes.success && appRes.success) {
      pass('T5: Master SIMPEG & Registry Queries', 'Pegawai: ' + pegRes.data.length + ', Unit: ' + unitRes.data.length + ', Jabatan: ' + jabRes.data.length + ', Apps: ' + appRes.data.length);
    } else {
      fail('T5: Master SIMPEG & Registry Queries', 'Gagal membaca master data.');
    }

  } catch (err) {
    fail('TX: Unhandled Error', err.message);
  }

  // Tampilkan ringkasan di log
  var total = results.length;
  var passed = results.filter(function(r) { return r.pass; }).length;
  Logger.log('=== HASIL DIAGNOSTIK SI-PLATFORM (' + passed + '/' + total + ' LULUS) ===');
  results.forEach(function(r) {
    Logger.log((r.pass ? '[LULUS] ' : '[GAGAL] ') + r.name + ' - ' + r.detail);
  });

  return { success: passed === total, passed: passed, total: total, results: results };
}
