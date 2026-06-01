const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const manifestPath = path.join(__dirname, '..', 'extension', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Shopee Review Exporter');
assert.ok(manifest.action.default_popup);
assert.ok(manifest.background.service_worker);
assert.ok(manifest.permissions.includes('activeTab'));
assert.ok(manifest.permissions.includes('scripting'));
assert.ok(manifest.permissions.includes('downloads'));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.sg')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.com.my')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.co.id')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.co.th')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.ph')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.vn')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.tw')));

console.log('Manifest validation passed.');
