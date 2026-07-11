/**
 * Render 部署时初始化数据库
 * 作用：把项目自带的 db/custom.db（含 949 条规格数据）复制到 Render 持久磁盘
 *
 * 逻辑：
 *   - 如果 /var/data/custom.db 已存在（之前部署过），跳过（保留用户后续添加的数据）
 *   - 如果 /var/data/custom.db 不存在（首次部署或磁盘被清空），从项目 db/custom.db 复制
 *
 * 运行环境：仅在 Render 构建阶段执行（package.json 的 build:render 脚本调用）
 * 在本地开发环境不会执行（因为 /var/data 目录不存在）
 */
const fs = require('fs');
const path = require('path');

const SOURCE_DB = path.join(__dirname, '..', 'db', 'custom.db');
const RENDER_DISK_DIR = '/var/data';
const TARGET_DB = path.join(RENDER_DISK_DIR, 'custom.db');

console.log('[render-init-db] 开始初始化数据库...');

// 非 Render 环境（本地开发），跳过
if (!fs.existsSync(RENDER_DISK_DIR)) {
  console.log(`[render-init-db] 未检测到 Render 持久磁盘目录 ${RENDER_DISK_DIR}，跳过初始化（本地开发模式）`);
  process.exit(0);
}

// 检查源数据库
if (!fs.existsSync(SOURCE_DB)) {
  console.error(`[render-init-db] 错误：源数据库 ${SOURCE_DB} 不存在！`);
  process.exit(1);
}

const sourceSize = fs.statSync(SOURCE_DB).size;
console.log(`[render-init-db] 源数据库: ${SOURCE_DB} (${(sourceSize / 1024).toFixed(1)} KB)`);

// 如果目标已存在，跳过
if (fs.existsSync(TARGET_DB)) {
  const targetSize = fs.statSync(TARGET_DB).size;
  console.log(`[render-init-db] 目标数据库已存在: ${TARGET_DB} (${(targetSize / 1024).toFixed(1)} KB)`);
  console.log('[render-init-db] 保留现有数据，跳过复制（避免覆盖用户后续添加的数据）');
  process.exit(0);
}

// 复制数据库
console.log(`[render-init-db] 复制数据库到: ${TARGET_DB}`);
fs.copyFileSync(SOURCE_DB, TARGET_DB);

// 同时复制 WAL 和 SHM 文件（如果存在）
for (const ext of ['-wal', '-shm']) {
  const srcFile = SOURCE_DB + ext;
  const targetFile = TARGET_DB + ext;
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, targetFile);
    console.log(`[render-init-db] 同步复制 ${path.basename(srcFile)}`);
  }
}

const finalSize = fs.statSync(TARGET_DB).size;
console.log(`[render-init-db] ✓ 初始化完成，目标数据库大小: ${(finalSize / 1024).toFixed(1)} KB`);
console.log('[render-init-db] 提示：首次启动后，所有数据库变更将持久化到此磁盘');
