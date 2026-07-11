# 电缆铜重计算系统

基于 Next.js 16 的电缆铜重计算工具，支持 KVVP、YJV、BVR、DJYPVP 等 7 个型号共 949 条规格的快速铜重计算。

## 功能特性

- **单条计算**：选择型号 + 规格 + 长度，立即得到铜重明细
- **批量计算**：粘贴多条物料清单（如 Excel 复制的文本），一次性计算
- **参数库管理**：内置 949 条规格数据，支持手动添加/Excel 导入新型号
- **计算明细**：分别显示导体、对屏、总屏、铜带、接地线、总铜重

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Next.js 16 · React 19 · Tailwind CSS 4 · shadcn/ui |
| 后端 | Next.js API Routes · Prisma ORM 6 |
| 数据库 | SQLite（单文件，约 268 KB） |
| 语言 | TypeScript 5 |

## 本地开发

```bash
npm install
npx prisma generate
npm run dev
# 访问 http://localhost:3000
```

## 生产部署

### 方式一：Render（推荐，免费）

1. Fork 或推送到 GitHub 仓库
2. 在 render.com 创建 Web Service，连接仓库
3. 使用以下配置（或直接用仓库中的 `render.yaml` 通过 Blueprint 部署）：

| 配置项 | 值 |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npx prisma generate && npm run build:render` |
| Start Command | `cd .next/standalone && node server.js` |
| 环境变量 `DATABASE_URL` | `file:/var/data/custom.db` |
| 持久磁盘 | 挂载到 `/var/data`，1 GB |

### 方式二：Linux 服务器直部署

```bash
npm install
npx prisma generate
npm run build
cd .next/standalone && NODE_ENV=production node server.js
```

详见 `download/电缆铜重计算系统-部署与发布指南.pdf`

## 关键计算规则

- **铜带规则**：只有型号名包含 `P2` 时才计算铜带重量
- **接地线规则**：DJYVRP/DJYVPR/DJYVVPR/DJYVP/DJYPVP/DJYJPYP/DJYPVRP/DJVPVP/DJVPVPR 9 个型号无接地线
- **对屏规则**：DJYVRP/DJYVPR/DJYVVPR 无对屏，仅算总屏

详见 `src/lib/copper-calculator.ts`

## 项目结构

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # 计算器主界面
│   │   └── api/                  # 后端 API
│   │       ├── copper/route.ts   # 铜重计算接口
│   │       └── cable-models/     # 型号库管理
│   ├── components/ui/            # shadcn/ui 组件
│   └── lib/
│       ├── copper-calculator.ts  # 计算引擎核心
│       └── db.ts                 # Prisma 客户端
├── prisma/schema.prisma          # 数据库 Schema
├── db/custom.db                  # SQLite 数据库（949 条规格）
├── render.yaml                   # Render 部署蓝图
└── package.json
```
