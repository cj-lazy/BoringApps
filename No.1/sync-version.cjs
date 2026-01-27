const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. 获取命令行参数中的版本号
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ 请提供版本号，例如: npm run version-sync 1.2.0');
  process.exit(1);
}

// 校验版本号格式 (x.y.z)
if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
  console.error('❌ 版本号格式错误，应为 x.y.z，当前输入为:', newVersion);
  process.exit(1);
}

const paths = {
  packageJson: path.resolve(__dirname, 'package.json'),
  tauriConfig: path.resolve(__dirname, 'src-tauri/tauri.conf.json'),
  cargoToml: path.resolve(__dirname, 'src-tauri/Cargo.toml'),
};

async function runSync() {
  try {
    // --- 第一步：清理那 7GB 的冗余缓存 ---
    console.log('🧹 正在清理 Rust 编译缓存 (释放空间)...');
    try {
      // 进入 src-tauri 目录执行 cargo clean
      execSync('cargo clean', { cwd: path.resolve(__dirname, 'src-tauri'), stdio: 'inherit' });
      console.log('✅ 缓存清理完成！');
    } catch (e) {
      console.warn('⚠️ 清理缓存失败（可能你没安装 Rust 环境），跳过此步。');
    }

    console.log(`\n🚀 开始同步版本号至: ${newVersion}...`);

    // --- 第二步：更新 package.json ---
    if (fs.existsSync(paths.packageJson)) {
      const pkg = JSON.parse(fs.readFileSync(paths.packageJson, 'utf-8'));
      pkg.version = newVersion;
      fs.writeFileSync(paths.packageJson, JSON.stringify(pkg, null, 2) + '\n');
      console.log('✅ package.json 已更新');
    }

    // --- 第三步：更新 tauri.conf.json ---
    if (fs.existsSync(paths.tauriConfig)) {
      const tauriPkg = JSON.parse(fs.readFileSync(paths.tauriConfig, 'utf-8'));
      tauriPkg.version = newVersion;
      // 顺便确保 identifier 也是干净的
      fs.writeFileSync(paths.tauriConfig, JSON.stringify(tauriPkg, null, 2) + '\n');
      console.log('✅ tauri.conf.json 已更新');
    }

    // --- 第四步：更新 Cargo.toml ---
    if (fs.existsSync(paths.cargoToml)) {
      let cargoContent = fs.readFileSync(paths.cargoToml, 'utf-8');
      cargoContent = cargoContent.replace(
        /^version\s*=\s*".*"/m,
        `version = "${newVersion}"`
      );
      fs.writeFileSync(paths.cargoToml, cargoContent);
      console.log('✅ Cargo.toml 已更新');
    }

    console.log('\n✨ [大功告成]：空间已释放，版本已同步！');
    console.log('💡 现在你可以运行 npm run tauri dev 重新编译了。');

  } catch (error) {
    console.error('\n❌ 同步过程中出错:', error.message);
  }
}

runSync();