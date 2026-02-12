// scripts/bump.js
const fs = require('fs');
const path = require('path');

console.log("🔄 开始版本升级流程...");

const pkgPath = path.join(__dirname, '..', 'package.json');
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');

if (!fs.existsSync(pkgPath)) {
  console.error("❌ 找不到 package.json！");
  process.exit(1);
}
const pkg = require(pkgPath);

// 版本号 +1 逻辑
const versionParts = pkg.version.split('.').map(Number);
versionParts[2] += 1; 
const newVersion = versionParts.join('.');

// 更新 package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`✅ package.json 版本已更新为: ${newVersion}`);

// 更新 tauri.conf.json
if (fs.existsSync(tauriConfPath)) {
  const tauriConfText = fs.readFileSync(tauriConfPath, 'utf-8');
  const tauriConf = JSON.parse(tauriConfText);

  if (tauriConf.package && tauriConf.package.version) {
    tauriConf.package.version = newVersion; // Tauri v1
  } else {
    tauriConf.version = newVersion; // Tauri v2
  }

  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));
  console.log(`✅ tauri.conf.json 版本已同步为: ${newVersion}`);
}

console.log("🎉 版本升级完成！");