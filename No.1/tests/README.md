# 回归验证

在 No.1 项目根目录运行。测试使用 Node.js 24，并依赖其 TypeScript 类型擦除能力。

## 前端与类型

```powershell
npm ci
npm test
npx tsc --noEmit
```

常规回归共 94 项。仓库提供两份公开合成样本，可在不使用个人笔记的情况下运行全部 96 项检查：

```powershell
$env:QA_MARKDOWN=(Resolve-Path tests/fixtures/technical.md).Path
$env:QA_LEGACY_MARKDOWN=(Resolve-Path tests/fixtures/legacy.md).Path
npm test
Remove-Item Env:QA_MARKDOWN
Remove-Item Env:QA_LEGACY_MARKDOWN
```

技术样本包含两张表格、独立/行内公式，以及 5.3 节公式前后的续编号；旧格式样本包含 53 段占位符公式和 80 个行内公式。样本验证只读原文件，并检查逐字节往返。普通的任意笔记不能直接替代这些专项样本。

## Rust

```powershell
cd src-tauri
cargo test --offline
cargo clippy --all-targets --offline -- -D warnings
```

共 33 项测试。首次构建尚未缓存依赖时，可先去掉 `--offline` 下载依赖。若系统临时目录的原子替换受到权限限制，可在项目根目录先设置隔离的临时目录：

```powershell
New-Item -ItemType Directory -Force artifacts/test-temp | Out-Null
$env:TEMP=(Resolve-Path artifacts/test-temp).Path
$env:TMP=$env:TEMP
```

## Windows 桌面验收

先构建正式程序，再运行测试：

```powershell
npm run tauri build -- --no-bundle
node tests/desktop-qa.mjs tests/fixtures/technical.md tests/fixtures/legacy.md
```

需要 Windows 交互桌面、WebView2、Tauri Driver 和版本匹配的 Microsoft Edge WebDriver。可用 `QA_TAURI_DRIVER`、`QA_EDGE_DRIVER` 指定驱动的绝对路径。默认目录分别是 `.tools/bin/tauri-driver.exe` 和 `.tools/edge/<版本>/msedgedriver.exe`；后者选择已安装的最高版本，须自行核对与 WebView2 匹配。

不传两个样本参数时运行 53 项，传入上述合成样本时运行全部 59 项。每次都创建新的 `artifacts/desktop-qa-*` 程序和笔记库副本，并隔离 WebView 配置。脚本不会对正在使用的程序执行测试；传入样本只复制并校验哈希。

覆盖内容包括 Markdown/公式保真、中文编辑、Callout、空闲草稿与恢复、源码模式、历史版本及改名关联、外部修改冲突、搜索分页定位、替换差异与语法排除、双栏、附件迁移与 ZIP、阅读设置、小窗口布局、回收与容量管理、Word/PDF 和整库搬迁。`productivity-checks.mjs` 进一步验收属性与原文保留、集合、反向链接、标题引用、双方括号联想、模板与片段、引用改名维护、自动保存、外部修改感知、增量索引、整库备份校验及恢复，以及笔记库切换与设置隔离。旧版用例显式关闭定时保存，新版用例单独开启并验证自动保存。

`native-dialog.ps1` 只操作本轮测试程序的系统保存窗口，只允许写入本轮目录，并拒绝覆盖已有导出文件。`verify-word.ps1` 可进一步通过本机 Microsoft Word 检查公式对象。PDF 验证 WebView 的打印输出，不发送物理打印任务。

结束时关闭测试窗口，保留报告、错误记录、截图和导出样例。所有生成内容、驱动、编译缓存和笔记数据都应留在 Git 忽略范围内。

4.3 的 `comfort-checks.mjs` 补充深色/系统主题、章节折叠、表格粘贴、多选整理与标签合并、集合固定与单元格编辑、附件去重及取消、缺失链接修复、流式打包取消、独立快速记录窗口、每日记录，以及千文件树和性能测量。`performance-4.3.json` 的输入耗时包含桌面驱动往返，JS 堆数据为 WebView 的近似读数，不作为硬性性能承诺。

## 4.4 工作流验收

`workflows.test.mjs` 检查安全替换、任务精确回写、稳定引用及自定义快捷键。真实 BlockNote schema 检查嵌套列表、多段引用和可视脚注的编辑/重开。Word 检查解包后 OOXML 中的 A4、行距、字体、编号、题注、脚注、页眉与页码。

`workflow-checks.mjs` 由桌面验收入口执行，使用隔离库验证全库替换、命令/工具栏设置、任务汇总、脚注编辑、来源改标题后实时刷新与跳转、Word 模板保存。所有样本为测试生成内容。
