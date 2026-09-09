#!/usr/bin/env node

/**
 * Pemkab Trenggalek - Clasp Script ID Helper
 * Penggunaan: node scripts/set-script-id.js <SCRIPT_ID>
 */

const fs = require('fs');
const path = require('path');

const scriptId = process.argv[2];

if (!scriptId || scriptId.startsWith('-')) {
  console.error('\n❌ Masukkan Script ID target!');
  console.error('Contoh: node scripts/set-script-id.js 1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890\n');
  process.exit(1);
}

const cleanId = scriptId.trim();
const claspPath = path.join(process.cwd(), '.clasp.json');

try {
  let config = {};
  if (fs.existsSync(claspPath)) {
    config = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
  }
  
  config.scriptId = cleanId;
  if (!config.rootDir) {
    config.rootDir = 'src';
  }

  fs.writeFileSync(claspPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('\n✅ .clasp.json berhasil diperbarui!');
  console.log(`📌 Script ID : ${cleanId}`);
  console.log(`📁 Root Dir  : ${config.rootDir}`);
  console.log('\n👉 Selanjutnya jalankan:');
  console.log('   npm run push     (untuk mengunggah kode ke Google Apps Script)');
  console.log('   npx clasp open   (untuk membuka Google Apps Script Editor)\n');
} catch (err) {
  console.error('❌ Gagal memperbarui .clasp.json:', err.message);
  process.exit(1);
}
