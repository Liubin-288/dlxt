// 生成《电缆铜重计算系统 - 部署与发布指南》docx 文档
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, Footer, Header, PageNumber, NumberFormat, LevelFormat,
  convertInchesToTwip, TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');
const path = require('path');

// ==== 样式工具 ====
const COLOR = {
  primary: '1F4E79',      // 深蓝
  accent: '2E75B6',       // 中蓝
  success: '548235',      // 绿
  warning: 'BF8F00',      // 金
  danger: 'C00000',       // 红
  gray: '595959',         // 中灰
  lightGray: 'D9D9D9',    // 浅灰
  bgLight: 'F2F2F2',      // 背景灰
  bgCode: 'F5F5F5',       // 代码背景
  black: '000000',
};

const FONT = {
  heading: '微软雅黑',
  body: '微软雅黑',
  code: 'Consolas',
};

// 段落工厂
const p = (text, opts = {}) => new Paragraph({
  spacing: { line: 312, before: opts.before || 0, after: opts.after || 60 },
  alignment: opts.align || AlignmentType.JUSTIFIED,
  indent: opts.indent !== undefined ? opts.indent : { firstLine: 420 },
  children: [new TextRun({
    text,
    font: opts.font || FONT.body,
    size: opts.size || 22,
    color: opts.color || COLOR.black,
    bold: opts.bold || false,
    italics: opts.italics || false,
  })],
});

// 多 run 段落
const pRuns = (runs, opts = {}) => new Paragraph({
  spacing: { line: 312, before: opts.before || 0, after: opts.after || 60 },
  alignment: opts.align || AlignmentType.JUSTIFIED,
  indent: opts.indent !== undefined ? opts.indent : { firstLine: 0 },
  children: runs.map(r => new TextRun({
    font: r.font || FONT.body,
    size: r.size || 22,
    color: r.color || COLOR.black,
    bold: r.bold || false,
    italics: r.italics || false,
  })),
});

// 标题
const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 200, line: 312 },
  children: [new TextRun({ text, font: FONT.heading, size: 36, bold: true, color: COLOR.primary })],
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 160, line: 312 },
  children: [new TextRun({ text, font: FONT.heading, size: 28, bold: true, color: COLOR.accent })],
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 120, line: 312 },
  children: [new TextRun({ text, font: FONT.heading, size: 24, bold: true, color: COLOR.black })],
});

// 代码块（无缩进，等宽字体，浅灰背景）
const code = (text) => new Paragraph({
  spacing: { line: 280, before: 80, after: 80 },
  indent: { firstLine: 0, left: 280 },
  shading: { type: ShadingType.CLEAR, fill: COLOR.bgCode, color: 'auto' },
  children: [new TextRun({
    text,
    font: FONT.code,
    size: 20,
    color: COLOR.black,
  })],
});

// 列表项
const bullet = (text, level = 0) => new Paragraph({
  spacing: { line: 312, after: 60 },
  indent: { left: 420 + level * 280, hanging: 280 },
  children: [
    new TextRun({ text: '• ', font: FONT.body, size: 22, color: COLOR.accent, bold: true }),
    new TextRun({ text, font: FONT.body, size: 22 }),
  ],
});

const numItem = (n, text) => new Paragraph({
  spacing: { line: 312, after: 60 },
  indent: { left: 420, hanging: 420 },
  children: [
    new TextRun({ text: `${n}. `, font: FONT.body, size: 22, bold: true, color: COLOR.accent }),
    new TextRun({ text, font: FONT.body, size: 22 }),
  ],
});

// 提示框
const tip = (text, type = 'tip') => {
  const colors = {
    tip: { bg: 'E8F4FD', border: COLOR.accent, label: '提示', labelColor: COLOR.accent },
    warn: { bg: 'FFF4E0', border: COLOR.warning, label: '注意', labelColor: COLOR.warning },
    danger: { bg: 'FDECEA', border: COLOR.danger, label: '警告', labelColor: COLOR.danger },
    success: { bg: 'EAF4E5', border: COLOR.success, label: '推荐', labelColor: COLOR.success },
  };
  const c = colors[type] || colors.tip;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: c.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: c.border },
      left: { style: BorderStyle.SINGLE, size: 24, color: c.border },
      right: { style: BorderStyle.SINGLE, size: 4, color: c.border },
    },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: c.bg, color: 'auto' },
        children: [
          new Paragraph({
            spacing: { line: 312, after: 0 },
            indent: { firstLine: 0 },
            children: [
              new TextRun({ text: `【${c.label}】`, font: FONT.body, size: 22, bold: true, color: c.labelColor }),
              new TextRun({ text: ' ' + text, font: FONT.body, size: 22, color: COLOR.black }),
            ],
          }),
        ],
      })],
    })],
  });
};

// 表格工厂
const table = (rows, opts = {}) => {
  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  const colWidths = opts.colWidths || null;

  const makeCell = (text, isHeader, colIdx) => new TableCell({
    width: colWidths ? { size: colWidths[colIdx], type: WidthType.PERCENTAGE } : undefined,
    shading: isHeader ? { type: ShadingType.CLEAR, fill: COLOR.primary, color: 'auto' } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({
      spacing: { line: 280, after: 0 },
      alignment: AlignmentType.LEFT,
      indent: { firstLine: 0 },
      children: [new TextRun({
        text: String(text),
        font: isHeader ? FONT.heading : FONT.body,
        size: 20,
        bold: isHeader,
        color: isHeader ? 'FFFFFF' : COLOR.black,
      })],
    })],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headerRow.map((t, i) => makeCell(t, true, i)),
      }),
      ...dataRows.map(row => new TableRow({
        cantSplit: true,
        children: row.map((t, i) => makeCell(t, false, i)),
      })),
    ],
  });
};

// 空段落（间距）
const spacer = (size = 120) => new Paragraph({
  spacing: { before: 0, after: size, line: 240 },
  indent: { firstLine: 0 },
  children: [new TextRun({ text: '', size: 2 })],
});

// ==== 封面 ====
const cover = [
  // 顶部留白
  new Paragraph({ spacing: { before: 0, after: 1200 }, children: [new TextRun({ text: '', size: 2 })] }),
  new Paragraph({ spacing: { before: 0, after: 1200 }, children: [new TextRun({ text: '', size: 2 })] }),
  // 主标题
  new Paragraph({
    spacing: { before: 0, after: 200, line: 360 },
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    children: [new TextRun({
      text: '电缆铜重计算系统',
      font: FONT.heading, size: 56, bold: true, color: COLOR.primary,
    })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 600, line: 360 },
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    children: [new TextRun({
      text: '部署与发布指南',
      font: FONT.heading, size: 44, bold: true, color: COLOR.accent,
    })],
  }),
  // 分隔线
  new Paragraph({
    spacing: { before: 200, after: 400 },
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR.accent, space: 1 },
    },
    children: [new TextRun({ text: '', size: 2 })],
  }),
  // 副信息
  new Paragraph({
    spacing: { before: 200, after: 120, line: 312 },
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    children: [new TextRun({ text: '技术栈：Next.js 16 · Prisma · SQLite · Tailwind CSS', font: FONT.body, size: 22, color: COLOR.gray })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 120, line: 312 },
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    children: [new TextRun({ text: '文档版本：v1.0', font: FONT.body, size: 22, color: COLOR.gray })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 120, line: 312 },
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    children: [new TextRun({ text: `生成日期：${new Date().toISOString().slice(0, 10)}`, font: FONT.body, size: 22, color: COLOR.gray })],
  }),
  // 强制换页
  new Paragraph({ children: [new PageBreak()] }),
];

// ==== 章节内容 ====

// 第1章 概述
const ch1 = [
  h1('第 1 章 项目概述'),
  
  h2('1.1 系统简介'),
  p('电缆铜重计算系统是一个面向电缆制造企业的内部工具，用于根据电缆型号、规格和长度快速计算铜材消耗重量。系统预置了 KVVP、YJV、BVR、DJYPVP、DJYP2VP2、BPYJVP 等 7 个型号共 949 条规格参数，支持单条手动计算和批量物料清单导入计算两种模式，是采购、生产、报价环节的常用辅助工具。'),
  p('系统采用前后端一体的 Next.js 全栈架构，前端使用 React 19 + Tailwind CSS + shadcn/ui 组件库构建管理界面，后端通过 Next.js API Routes 暴露铜重计算和参数库管理接口，数据持久化使用 Prisma ORM + SQLite，整个应用可以打包为一个独立的 Node.js 进程运行，无需额外的数据库服务器。'),
  
  h2('1.2 技术栈一览'),
  table([
    ['层级', '技术', '版本', '说明'],
    ['运行时', 'Node.js', '≥ 18.18', '生产环境推荐 LTS 版本'],
    ['框架', 'Next.js', '16.x', '使用 standalone 输出模式'],
    ['UI 库', 'React + shadcn/ui', '19.x', '基于 Radix UI 二次封装'],
    ['样式', 'Tailwind CSS', '4.x', '原子化 CSS'],
    ['ORM', 'Prisma', '6.x', '类型安全的数据库访问层'],
    ['数据库', 'SQLite', '内置', '单文件部署，无需独立数据库服务'],
    ['语言', 'TypeScript', '5.x', '全栈类型安全'],
    ['包管理', 'npm', '≥ 10', '可替换为 pnpm/yarn/bun'],
  ], { colWidths: [15, 25, 15, 45] }),
  spacer(160),
  
  h2('1.3 项目目录结构'),
  code('电缆铜重计算系统/'),
  code('├── src/'),
  code('│   ├── app/                  # Next.js App Router'),
  code('│   │   ├── page.tsx          # 主页面（计算器UI）'),
  code('│   │   ├── layout.tsx        # 全局布局'),
  code('│   │   └── api/              # 后端 API 路由'),
  code('│   │       ├── copper/route.ts       # 铜重计算接口'),
  code('│   │       └── cable-models/route.ts # 型号库管理接口'),
  code('│   ├── components/ui/         # shadcn/ui 组件'),
  code('│   └── lib/'),
  code('│       ├── copper-calculator.ts  # 铜重计算核心引擎'),
  code('│       ├── cable-data.json       # KVVP 内置规格数据'),
  code('│       └── db.ts                 # Prisma 客户端单例'),
  code('├── prisma/schema.prisma      # 数据库 Schema 定义'),
  code('├── db/custom.db              # SQLite 数据库文件（生产数据）'),
  code('├── public/                   # 静态资源'),
  code('├── package.json'),
  code('├── next.config.ts            # output: "standalone"'),
  code('├── .env                      # DATABASE_URL 等环境变量'),
  code('└── start.sh                  # 快速启动脚本'),
  spacer(120),
  
  h2('1.4 部署方式总览'),
  p('根据使用场景和规模，本系统提供四种部署方案，下表对比了它们的特点，你可以根据实际需求选择：'),
  table([
    ['方案', '难度', '适用场景', '推荐度'],
    ['Linux 服务器直部署', '★☆☆', '内部使用、单机部署、低成本', '★★★★★'],
    ['PM2 进程托管', '★★☆', '需要进程守护、自动重启', '★★★★☆'],
    ['Docker 容器化', '★★★', '多环境一致性、CI/CD 流水线', '★★★★☆'],
    ['Nginx + 反向代理', '★★★', '已有 Nginx、需 HTTPS/域名', '★★★★☆'],
  ], { colWidths: [22, 12, 46, 20] }),
  spacer(120),
  tip('如果是首次部署或内部小范围使用，强烈推荐方案一（Linux 服务器直部署），3 条命令即可启动，无需学习额外工具。', 'success'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第2章 部署前准备
const ch2 = [
  h1('第 2 章 部署前准备'),
  
  h2('2.1 服务器环境要求'),
  p('在开始部署之前，需要准备一台满足以下最低配置的服务器。系统资源占用较低，1 核 1G 的小型云服务器或公司内网虚拟机即可承载 50 人左右的并发使用。'),
  table([
    ['资源', '最低配置', '推荐配置', '说明'],
    ['CPU', '1 核', '2 核', '计算密集型操作（批量计算）会受益于多核'],
    ['内存', '512 MB', '1 GB', 'Node.js + Next.js 运行时约占用 200-300 MB'],
    ['磁盘', '1 GB', '5 GB', '系统+依赖+数据库+日志，预留扩容空间'],
    ['操作系统', 'Linux 64位', 'Ubuntu 22.04 LTS', '也支持 CentOS 7+/Debian 10+/Alpine'],
    ['Node.js', '18.18+', '20 LTS', '必须，Next.js 16 的硬性要求'],
    ['npm', '10+', '10+', '随 Node.js 安装'],
    ['网络', '开放 3000 端口', '内网或公网均可', '可配置为 80/443 通过反向代理'],
  ], { colWidths: [15, 18, 22, 45] }),
  spacer(160),
  
  h2('2.2 安装 Node.js 运行时'),
  p('推荐使用 NodeSource 官方源安装 Node.js 20 LTS，避免使用系统自带的老版本。下面是 Ubuntu/Debian 系统的安装命令：'),
  code('# 安装 Node.js 20 LTS（Ubuntu/Debian）'),
  code('curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -'),
  code('sudo apt-get install -y nodejs'),
  code(''),
  code('# 验证安装'),
  code('node --version    # 应输出 v20.x.x'),
  code('npm --version     # 应输出 10.x.x'),
  spacer(120),
  p('CentOS/RHEL 系统使用以下命令：'),
  code('# 安装 Node.js 20 LTS（CentOS/RHEL）'),
  code('curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -'),
  code('sudo yum install -y nodejs'),
  spacer(120),
  tip('如果服务器无法访问外网，可以在本地下载 Node.js 二进制包后上传，解压到 /usr/local/ 目录并配置 PATH 即可。', 'tip'),
  
  h2('2.3 获取项目代码'),
  p('项目代码可以通过以下三种方式之一获取，推荐使用 Git 克隆以便后续版本更新：'),
  h3('方式一：Git 克隆（推荐）'),
  code('# 在服务器上执行'),
  code('cd /opt'),
  code('git clone <你的仓库地址> cable-copper-system'),
  code('cd cable-copper-system'),
  spacer(80),
  h3('方式二：上传压缩包'),
  p('将本地项目打包为 tar.gz 后上传到服务器：'),
  code('# 本地打包（排除 node_modules 和 .next）'),
  code('tar --exclude="node_modules" --exclude=".next" -czf cable-system.tar.gz .'),
  code(''),
  code('# 上传后解压'),
  code('scp cable-system.tar.gz user@server:/opt/'),
  code('ssh user@server'),
  code('cd /opt && mkdir cable-copper-system && tar -xzf cable-system.tar.gz -C cable-copper-system'),
  code('cd cable-copper-system'),
  spacer(80),
  h3('方式三：使用当前 Z.ai 沙箱的项目'),
  p('当前沙箱中已经包含完整项目文件，位于 /home/z/my-project/。可以将整个目录打包下载：'),
  code('# 在沙箱中打包'),
  code('cd /home/z/my-project'),
  code('tar --exclude="node_modules" --exclude=".next" --exclude="upload" \\'),
  code('    -czf /home/z/my-project/download/cable-system.tar.gz .'),
  code(''),
  code('# 然后从 download 目录下载 cable-system.tar.gz 上传到你的服务器'),
  spacer(120),
  
  h2('2.4 配置环境变量'),
  p('项目根目录下的 .env 文件定义了数据库连接地址，部署时需要确认或修改：'),
  code('# .env 文件内容'),
  code('DATABASE_URL=file:/home/z/my-project/db/custom.db'),
  spacer(80),
  p('部署到生产服务器时，需要把路径改为实际的部署路径。例如部署到 /opt/cable-copper-system/：'),
  code('# 修改 .env'),
  code('DATABASE_URL=file:/opt/cable-copper-system/db/custom.db'),
  spacer(80),
  tip('SQLite 数据库文件位置非常重要，请确保部署目录有读写权限，且路径与 .env 一致，否则系统会创建空数据库导致型号数据丢失。', 'warn'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第3章 方案一：Linux服务器直部署
const ch3 = [
  h1('第 3 章 方案一：Linux 服务器直部署（推荐）'),
  
  h2('3.1 方案特点'),
  p('这是最简单直接的部署方式，使用 Next.js 的 standalone 输出模式，把整个应用打包为一个自包含的 Node.js 进程。优点是部署快、依赖少、调试方便；缺点是没有进程守护，进程意外退出后需要手动重启。适合内部使用、单机部署、对可用性要求不高的场景。'),
  
  h2('3.2 完整部署步骤'),
  h3('步骤 1：安装依赖'),
  code('cd /opt/cable-copper-system'),
  code('npm install --production=false   # 需要开发依赖来构建'),
  code('npx prisma generate              # 生成 Prisma 客户端'),
  spacer(80),
  
  h3('步骤 2：构建生产版本'),
  code('npm run build'),
  spacer(80),
  p('build 脚本会执行以下操作（已在 package.json 中配置好）：'),
  bullet('prisma generate — 生成数据库客户端代码'),
  bullet('next build — 编译 TypeScript、优化打包、生成 .next/standalone 目录'),
  bullet('cp -r .next/static .next/standalone/.next/ — 复制静态资源'),
  bullet('cp -r public .next/standalone/ — 复制 public 目录'),
  bullet('cp -r db .next/standalone/ — 复制数据库文件'),
  bullet('cp .env .next/standalone/ — 复制环境变量配置'),
  spacer(80),
  tip('首次构建约需 2-5 分钟，取决于服务器性能。构建完成后会在 .next/standalone/ 生成一个完整可运行的项目副本。', 'tip'),
  spacer(80),
  
  h3('步骤 3：启动生产服务'),
  code('# 启动（前台运行，用于测试）'),
  code('cd .next/standalone'),
  code('NODE_ENV=production node server.js'),
  code(''),
  code('# 验证：浏览器访问 http://服务器IP:3000'),
  spacer(80),
  
  h3('步骤 4：后台运行（使用 nohup）'),
  code('# 后台启动，日志输出到 prod.log'),
  code('nohup env NODE_ENV=production node server.js > prod.log 2>&1 &'),
  code(''),
  code('# 记录进程 ID，方便后续停止'),
  code('echo $! > server.pid'),
  code(''),
  code('# 查看日志'),
  code('tail -f prod.log'),
  code(''),
  code('# 停止服务'),
  code('kill $(cat server.pid)'),
  spacer(120),
  
  h2('3.3 部署验证清单'),
  p('部署完成后，请逐项验证以下功能正常：'),
  table([
    ['验证项', '操作', '预期结果', '状态'],
    ['首页访问', '浏览器打开 http://IP:3000', '显示计算器界面', '☐'],
    ['型号加载', '点击型号下拉框', '显示 7 个型号选项', '☐'],
    ['单条计算', '输入 KVVP 14×2.5 / 100m', '总铜重 36.24 kg', '☐'],
    ['批量计算', '粘贴多条物料清单', '批量计算并显示明细', '☐'],
    ['参数库查看', '打开型号管理面板', '显示 949 条规格', '☐'],
    ['数据库持久化', '重启服务后再次查询', '数据不丢失', '☐'],
  ], { colWidths: [18, 32, 35, 15] }),
  spacer(120),
  
  h2('3.4 常见问题'),
  h3('Q1：访问 http://IP:3000 显示连接被拒绝？'),
  p('原因可能是：服务未启动、防火墙拦截、监听地址不对。排查步骤：'),
  code('# 1. 检查进程是否在运行'),
  code('ps -ef | grep "node server.js" | grep -v grep'),
  code(''),
  code('# 2. 检查端口是否监听'),
  code('ss -tnlp | grep 3000    # 应看到 LISTEN 0.0.0.0:3000'),
  code(''),
  code('# 3. 检查防火墙'),
  code('sudo ufw status                  # Ubuntu'),
  code('sudo firewall-cmd --list-ports   # CentOS'),
  code('sudo ufw allow 3000/tcp          # 放行 3000 端口'),
  spacer(80),
  
  h3('Q2：启动报错 "Cannot find module @prisma/client"？'),
  p('Prisma 客户端未生成。执行：'),
  code('cd /opt/cable-copper-system'),
  code('npx prisma generate'),
  code('npm run build'),
  spacer(80),
  
  h3('Q3：界面打开但型号下拉为空？'),
  p('数据库未正确复制或路径错误。检查：'),
  code('# 1. 确认数据库文件存在'),
  code('ls -lh .next/standalone/db/custom.db   # 应有数据，约 268KB'),
  code(''),
  code('# 2. 确认 .env 路径正确'),
  code('cat .next/standalone/.env'),
  code('# 应输出: DATABASE_URL=file:./db/custom.db 或绝对路径'),
  code(''),
  code('# 3. 路径不对时，手动修正 .env 后重启'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第4章 方案二：PM2 进程托管
const ch4 = [
  h1('第 4 章 方案二：PM2 进程托管'),
  
  h2('4.1 方案特点'),
  p('PM2 是 Node.js 生态中最流行的进程管理器，能为应用提供进程守护、自动重启、日志切割、负载均衡等企业级特性。相比方案一的 nohup 方式，PM2 在进程崩溃后能自动拉起，且支持开机自启，是生产环境推荐的部署方式。'),
  
  h2('4.2 安装 PM2'),
  code('# 全局安装 PM2'),
  code('sudo npm install -g pm2'),
  code(''),
  code('# 验证'),
  code('pm2 --version    # 应输出 5.x.x'),
  spacer(80),
  
  h2('4.3 创建 PM2 配置文件'),
  p('在项目根目录创建 ecosystem.config.js：'),
  code('// /opt/cable-copper-system/ecosystem.config.js'),
  code('module.exports = {'),
  code('  apps: [{'),
  code('    name: "cable-copper",'),
  code('    script: ".next/standalone/server.js",'),
  code('    cwd: "/opt/cable-copper-system/.next/standalone",'),
  code('    instances: 1,                    // 单实例（SQLite 不支持多实例）'),
  code('    exec_mode: "fork",'),
  code('    env: {'),
  code('      NODE_ENV: "production",'),
  code('      PORT: 3000,'),
  code('    },'),
  code('    error_file: "/var/log/cable-copper/error.log",'),
  code('    out_file: "/var/log/cable-copper/out.log",'),
  code('    log_date_format: "YYYY-MM-DD HH:mm:ss",'),
  code('    merge_logs: true,'),
  code('    autorestart: true,               // 进程崩溃自动重启'),
  code('    max_restarts: 10,                // 1分钟内最多重启10次'),
  code('    restart_delay: 5000,             // 重启间隔 5 秒'),
  code('    watch: false,                    // 生产环境关闭文件监听'),
  code('  }]'),
  code('};'),
  spacer(80),
  code('# 创建日志目录'),
  code('sudo mkdir -p /var/log/cable-copper'),
  code('sudo chown -R $(whoami) /var/log/cable-copper'),
  spacer(120),
  
  h2('4.4 启动与管理'),
  code('# 启动服务'),
  code('cd /opt/cable-copper-system'),
  code('pm2 start ecosystem.config.js'),
  code(''),
  code('# 查看状态'),
  code('pm2 status'),
  code(''),
  code('# 查看日志'),
  code('pm2 logs cable-copper'),
  code(''),
  code('# 重启'),
  code('pm2 restart cable-copper'),
  code(''),
  code('# 停止'),
  code('pm2 stop cable-copper'),
  code(''),
  code('# 删除'),
  code('pm2 delete cable-copper'),
  spacer(120),
  
  h2('4.5 配置开机自启'),
  code('# 生成系统启动脚本'),
  code('pm2 startup'),
  code('# 按提示执行输出中的 sudo 命令（不同系统不同）'),
  code(''),
  code('# 保存当前 PM2 进程列表，开机自动恢复'),
  code('pm2 save'),
  spacer(80),
  tip('配置开机自启后，服务器重启时 PM2 会自动拉起 cable-copper 服务，无需人工干预。', 'success'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第5章 方案三：Docker
const ch5 = [
  h1('第 5 章 方案三：Docker 容器化部署'),
  
  h2('5.1 方案特点'),
  p('Docker 部署把应用和运行环境打包为镜像，一次构建到处运行，环境一致性最佳。适合需要频繁部署、多环境切换、CI/CD 流水线的场景。但需要服务器预装 Docker，且学习曲线略高。'),
  
  h2('5.2 编写 Dockerfile'),
  p('在项目根目录创建 Dockerfile：'),
  code('# /opt/cable-copper-system/Dockerfile'),
  code(''),
  code('# === 阶段 1：依赖安装 ==='),
  code('FROM node:20-bookworm-slim AS deps'),
  code('WORKDIR /app'),
  code('COPY package*.json ./'),
  code('RUN npm ci --production=false'),
  code(''),
  code('# === 阶段 2：构建 ==='),
  code('FROM node:20-bookworm-slim AS builder'),
  code('WORKDIR /app'),
  code('COPY --from=deps /app/node_modules ./node_modules'),
  code('COPY . .'),
  code('RUN npx prisma generate && npm run build'),
  code(''),
  code('# === 阶段 3：运行时（精简镜像）==='),
  code('FROM node:20-bookworm-slim AS runner'),
  code('WORKDIR /app'),
  code('ENV NODE_ENV=production'),
  code('ENV PORT=3000'),
  code(''),
  code('# 复制 standalone 产物'),
  code('COPY --from=builder /app/.next/standalone ./'),
  code('COPY --from=builder /app/.next/static ./.next/static'),
  code('COPY --from=builder /app/public ./public'),
  code('COPY --from=builder /app/db ./db'),
  code('COPY --from=builder /app/.env ./.env'),
  code(''),
  code('EXPOSE 3000'),
  code('CMD ["node", "server.js"]'),
  spacer(120),
  
  h2('5.3 编写 docker-compose.yml'),
  p('使用 docker-compose 简化管理，并挂载数据库目录实现数据持久化：'),
  code('# /opt/cable-copper-system/docker-compose.yml'),
  code('version: "3.8"'),
  code('services:'),
  code('  cable-app:'),
  code('    build: .'),
  code('    container_name: cable-copper'),
  code('    ports:'),
  code('      - "3000:3000"'),
  code('    volumes:'),
  code('      - ./data/db:/app/db          # 数据库持久化'),
  code('      - ./logs:/app/logs            # 日志持久化'),
  code('    restart: unless-stopped'),
  code('    environment:'),
  code('      - NODE_ENV=production'),
  spacer(120),
  
  h2('5.4 构建与启动'),
  code('# 构建镜像（首次约 5-10 分钟）'),
  code('docker-compose build'),
  code(''),
  code('# 启动容器'),
  code('docker-compose up -d'),
  code(''),
  code('# 查看运行状态'),
  code('docker-compose ps'),
  code(''),
  code('# 查看日志'),
  code('docker-compose logs -f cable-app'),
  code(''),
  code('# 停止'),
  code('docker-compose down'),
  spacer(80),
  tip('首次启动前，需要把现有的 db/custom.db 复制到 ./data/db/ 目录，否则容器会创建空数据库。命令：mkdir -p ./data/db && cp db/custom.db ./data/db/', 'warn'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第6章 方案四：Nginx反向代理
const ch6 = [
  h1('第 6 章 方案四：Nginx 反向代理 + HTTPS'),
  
  h2('6.1 方案特点'),
  p('如果需要通过域名访问、配置 HTTPS 证书、或与已有 Web 服务共享 80/443 端口，可以在 Node.js 服务前加一层 Nginx 反向代理。这种架构在企业生产环境最常见，也是公网部署的标准做法。'),
  
  h2('6.2 安装 Nginx'),
  code('# Ubuntu/Debian'),
  code('sudo apt update && sudo apt install -y nginx'),
  code(''),
  code('# CentOS/RHEL'),
  code('sudo yum install -y nginx'),
  code(''),
  code('# 启动并设置开机自启'),
  code('sudo systemctl start nginx'),
  code('sudo systemctl enable nginx'),
  spacer(120),
  
  h2('6.3 配置反向代理'),
  p('创建 Nginx 配置文件 /etc/nginx/conf.d/cable-copper.conf：'),
  code('# /etc/nginx/conf.d/cable-copper.conf'),
  code('server {'),
  code('    listen 80;'),
  code('    server_name cable.yourdomain.com;    # 替换为你的域名或IP'),
  code(''),
  code('    # 反向代理到 Next.js 服务'),
  code('    location / {'),
  code('        proxy_pass http://127.0.0.1:3000;'),
  code('        proxy_http_version 1.1;'),
  code('        proxy_set_header Upgrade $http_upgrade;'),
  code('        proxy_set_header Connection "upgrade";'),
  code('        proxy_set_header Host $host;'),
  code('        proxy_set_header X-Real-IP $remote_addr;'),
  code('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'),
  code('        proxy_set_header X-Forwarded-Proto $scheme;'),
  code('        proxy_cache_bypass $http_upgrade;'),
  code('    }'),
  code(''),
  code('    # 静态资源缓存'),
  code('    location /_next/static/ {'),
  code('        proxy_pass http://127.0.0.1:3000;'),
  code('        expires 365d;'),
  code('        add_header Cache-Control "public, immutable";'),
  code('    }'),
  code(''),
  code('    # 上传文件大小限制'),
  code('    client_max_body_size 50M;'),
  code('}'),
  spacer(80),
  code('# 测试配置语法'),
  code('sudo nginx -t'),
  code(''),
  code('# 重新加载配置'),
  code('sudo nginx -s reload'),
  spacer(120),
  
  h2('6.4 配置 HTTPS（推荐）'),
  p('公网部署强烈建议启用 HTTPS。使用 Let\'s Encrypt 免费证书，自动续期：'),
  code('# 安装 certbot'),
  code('sudo apt install -y certbot python3-certbot-nginx'),
  code(''),
  code('# 申请并自动配置证书'),
  code('sudo certbot --nginx -d cable.yourdomain.com'),
  code(''),
  code('# 按提示输入邮箱、同意条款、选择是否重定向 HTTP 到 HTTPS'),
  code(''),
  code('# 证书自动续期（已自动配置 cron）'),
  code('sudo certbot renew --dry-run    # 测试续期'),
  spacer(80),
  tip('配置 HTTPS 后，建议在 Nginx 中添加 HSTS 头和安全响应头，提升安全性。', 'tip'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第7章 运维手册
const ch7 = [
  h1('第 7 章 运维手册'),
  
  h2('7.1 数据库备份与恢复'),
  p('SQLite 数据库是单文件，备份非常简单，直接复制文件即可。建议建立定期备份机制，避免数据丢失。'),
  h3('手动备份'),
  code('# 备份数据库到带时间戳的文件'),
  code('cd /opt/cable-copper-system'),
  code('cp db/custom.db backups/custom-$(date +%Y%m%d-%H%M%S).db'),
  code(''),
  code('# 查看备份列表'),
  code('ls -lh backups/'),
  spacer(80),
  
  h3('自动备份（cron 定时任务）'),
  code('# 编辑 crontab'),
  code('crontab -e'),
  code(''),
  code('# 添加以下内容：每天凌晨 2 点备份，保留最近 30 天'),
  code('0 2 * * * cp /opt/cable-copper-system/db/custom.db /opt/cable-copper-system/backups/custom-$(date +\\%Y\\%m\\%d).db && find /opt/cable-copper-system/backups/ -name "custom-*.db" -mtime +30 -delete'),
  spacer(80),
  
  h3('数据恢复'),
  code('# 1. 停止服务'),
  code('pm2 stop cable-copper    # 或 kill 进程'),
  code(''),
  code('# 2. 替换数据库文件'),
  code('cp backups/custom-20260101-020000.db db/custom.db'),
  code(''),
  code('# 3. 重启服务'),
  code('pm2 start cable-copper'),
  spacer(120),
  
  h2('7.2 版本更新流程'),
  p('当系统有新版本需要更新时，按以下步骤操作，确保业务不中断：'),
  numItem(1, '备份数据库（按 7.1 节操作）'),
  numItem(2, '拉取最新代码：git pull origin main（或上传新代码包解压）'),
  numItem(3, '安装新增依赖：npm install'),
  numItem(4, '重新生成 Prisma 客户端：npx prisma generate'),
  numItem(5, '如果 schema.prisma 有变更，执行：npx prisma db push'),
  numItem(6, '重新构建：npm run build'),
  numItem(7, '重启服务：pm2 restart cable-copper'),
  numItem(8, '验证功能：访问 http://IP:3000 测试'),
  spacer(80),
  code('# 一键更新脚本示例（update.sh）'),
  code('#!/bin/bash'),
  code('set -e'),
  code('cd /opt/cable-copper-system'),
  code('echo "1. 备份数据库..."'),
  code('cp db/custom.db backups/custom-$(date +%Y%m%d-%H%M%S).db'),
  code('echo "2. 拉取代码..."'),
  code('git pull origin main'),
  code('echo "3. 安装依赖..."'),
  code('npm install'),
  code('echo "4. 生成 Prisma 客户端..."'),
  code('npx prisma generate'),
  code('echo "5. 构建..."'),
  code('npm run build'),
  code('echo "6. 重启服务..."'),
  code('pm2 restart cable-copper'),
  code('echo "✓ 更新完成"'),
  spacer(120),
  
  h2('7.3 日志监控'),
  p('系统运行日志是排查问题的关键依据。根据部署方式不同，日志位置也不同：'),
  table([
    ['部署方式', '日志位置', '查看命令'],
    ['nohup 直部署', '/opt/cable-copper-system/prod.log', 'tail -f prod.log'],
    ['PM2 托管', '/var/log/cable-copper/out.log', 'pm2 logs cable-copper'],
    ['PM2 错误日志', '/var/log/cable-copper/error.log', 'pm2 logs cable-copper --err'],
    ['Docker', '容器内 /app/logs/', 'docker-compose logs -f cable-app'],
    ['Nginx 访问', '/var/log/nginx/access.log', 'sudo tail -f /var/log/nginx/access.log'],
    ['Nginx 错误', '/var/log/nginx/error.log', 'sudo tail -f /var/log/nginx/error.log'],
  ], { colWidths: [20, 35, 45] }),
  spacer(120),
  
  h2('7.4 性能优化建议'),
  bullet('启用 Gzip 压缩：在 Nginx 配置中添加 gzip on; gzip_types text/plain application/json application/javascript text/css;'),
  bullet('静态资源缓存：Next.js 的 _next/static/ 目录内容带 hash，可长期缓存（已配置 365 天）'),
  bullet('数据库索引：Prisma schema 中的 modelId_spec 字段已有唯一索引，批量查询性能良好'),
  bullet('进程数：SQLite 不支持多进程写入，PM2 不要配置 cluster 模式，保持 fork 单实例'),
  bullet('内存限制：Node.js 默认堆内存 1.5GB，单次批量计算数千条数据无压力'),
  bullet('定期重启：可在 PM2 配置中添加 cron_restart: "0 3 * * *" 每天凌晨 3 点重启，释放内存'),
  spacer(120),
  
  h2('7.5 故障排查清单'),
  table([
    ['故障现象', '可能原因', '排查步骤'],
    ['页面打不开', '服务未启动 / 端口未开放 / 防火墙', '检查进程、ss -tnlp | grep 3000、检查 ufw/firewalld'],
    ['500 内部错误', '代码 bug / 数据库连接失败', '查看 pm2 logs 或 prod.log，定位错误堆栈'],
    ['型号下拉为空', '数据库未初始化 / 路径错误', '检查 .env 路径、确认 db/custom.db 存在且有数据'],
    ['计算结果异常', '规则配置错误 / 数据脏数据', '对比 Excel 公式结果、检查 copper-calculator.ts'],
    ['上传 Excel 失败', '文件过大 / 格式不符', '检查 Nginx client_max_body_size、Excel 列名映射'],
    ['服务突然变慢', '内存泄漏 / 大批量计算', 'pm2 monit 查看内存、考虑重启服务'],
    ['数据库锁定', '多进程同时写 / 备份时占用', '保证单实例运行、备份用 cp 不用 sqlite3 命令'],
  ], { colWidths: [20, 30, 50] }),
  spacer(120),
  
  h2('7.6 安全加固建议'),
  p('如果系统暴露在公网，建议执行以下安全加固：'),
  numItem(1, '配置 HTTPS（参考第 6.4 节），强制 HTTP 跳转 HTTPS'),
  numItem(2, '在 Nginx 中限制访问 IP（如果只供内网使用）：allow 192.168.1.0/24; deny all;'),
  numItem(3, '禁用 Next.js 的开发工具：确保 NODE_ENV=production'),
  numItem(4, '数据库文件权限收紧：chmod 600 db/custom.db'),
  numItem(5, '定期更新服务器系统：apt update && apt upgrade'),
  numItem(6, '配置 fail2ban 防止暴力破解（如果开放了 SSH）'),
  numItem(7, '关闭不必要的端口，仅开放 80/443/22'),
  numItem(8, '定期审计日志，关注异常访问模式'),
  new Paragraph({ children: [new PageBreak()] }),
];

// 第8章 附录
const ch8 = [
  h1('第 8 章 附录'),
  
  h2('8.1 快速命令速查表'),
  table([
    ['场景', '命令'],
    ['启动开发服务器', 'npm run dev'],
    ['构建生产版本', 'npm run build'],
    ['启动生产服务', 'NODE_ENV=production node .next/standalone/server.js'],
    ['生成 Prisma 客户端', 'npx prisma generate'],
    ['同步 Schema 到数据库', 'npx prisma db push'],
    ['查看数据库内容', 'npx prisma studio'],
    ['重置数据库（慎用）', 'npx prisma migrate reset'],
    ['代码检查', 'npm run lint'],
  ], { colWidths: [30, 70] }),
  spacer(120),
  
  h2('8.2 关键文件说明'),
  table([
    ['文件路径', '作用', '是否需要部署'],
    ['src/lib/copper-calculator.ts', '铜重计算核心引擎（含所有死规则）', '是'],
    ['src/app/api/copper/route.ts', '铜重计算 API 接口', '是'],
    ['src/app/page.tsx', '前端计算器界面', '是'],
    ['prisma/schema.prisma', '数据库 Schema 定义', '是'],
    ['db/custom.db', 'SQLite 数据库文件（含 949 条规格）', '是（必须保留）'],
    ['.env', '环境变量配置（DATABASE_URL）', '是（路径需调整）'],
    ['next.config.ts', 'Next.js 配置（output: standalone）', '是'],
    ['package.json', '依赖与脚本定义', '是'],
    ['ecosystem.config.js', 'PM2 配置文件（方案二）', '可选'],
    ['Dockerfile', 'Docker 构建文件（方案三）', '可选'],
  ], { colWidths: [35, 45, 20] }),
  spacer(120),
  
  h2('8.3 部署方案选型决策树'),
  p('如果你仍然不确定选择哪种方案，可以参考以下决策流程：'),
  bullet('只是内部几个人用？→ 方案一（Linux 直部署），3 条命令搞定'),
  bullet('需要 7×24 稳定运行？→ 方案二（PM2 托管），自动重启 + 开机自启'),
  bullet('有多套环境（测试/预发/生产）？→ 方案三（Docker），环境一致性最佳'),
  bullet('需要公网域名访问？→ 方案四（Nginx + HTTPS），生产标配'),
  bullet('以上需求都有？→ 方案二 + 方案四组合（PM2 + Nginx + HTTPS），企业级方案'),
  spacer(120),
  
  h2('8.4 联系与支持'),
  p('如果在部署过程中遇到本文档未覆盖的问题，可以通过以下方式获取支持：'),
  bullet('查看 worklog.md 文件了解系统演进历史和已知问题修复记录'),
  bullet('查看 src/lib/copper-calculator.ts 顶部的注释了解计算公式和死规则'),
  bullet('查看 prisma/schema.prisma 了解数据库表结构'),
  bullet('使用 npx prisma studio 可视化查看数据库内容，辅助调试'),
  spacer(160),
  
  // 结语
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 200, line: 312 },
    indent: { firstLine: 0 },
    children: [new TextRun({
      text: '— 部署指南完 —',
      font: FONT.body, size: 22, color: COLOR.gray, italics: true,
    })],
  }),
];

// ==== 组装文档 ====
const doc = new Document({
  creator: '电缆铜重计算系统',
  title: '部署与发布指南',
  description: 'Next.js 16 项目部署文档',
  styles: {
    default: {
      document: {
        run: { font: FONT.body, size: 22, color: COLOR.black },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  sections: [
    // 封面段（无页码）
    {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: cover,
    },
    // 正文段
    {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { line: 240, after: 0 },
            indent: { firstLine: 0 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.lightGray, space: 1 } },
            children: [new TextRun({
              text: '电缆铜重计算系统 · 部署指南',
              font: FONT.body, size: 18, color: COLOR.gray,
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 0 },
            indent: { firstLine: 0 },
            children: [
              new TextRun({ text: '第 ', font: FONT.body, size: 18, color: COLOR.gray }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT.body, size: 18, color: COLOR.gray }),
              new TextRun({ text: ' 页 / 共 ', font: FONT.body, size: 18, color: COLOR.gray }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT.body, size: 18, color: COLOR.gray }),
              new TextRun({ text: ' 页', font: FONT.body, size: 18, color: COLOR.gray }),
            ],
          })],
        }),
      },
      children: [...ch1, ...ch2, ...ch3, ...ch4, ...ch5, ...ch6, ...ch7, ...ch8],
    },
  ],
});

// ==== 输出 ====
const outputPath = '/home/z/my-project/download/电缆铜重计算系统-部署与发布指南.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ 部署指南已生成: ${outputPath}`);
  console.log(`  文件大小: ${(buffer.length / 1024).toFixed(2)} KB`);
}).catch(err => {
  console.error('生成失败:', err);
  process.exit(1);
});
