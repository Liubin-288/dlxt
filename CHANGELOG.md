# 变更记录 (CHANGELOG)

> 本文件记录项目的所有修改历史。AI助手每次修改代码前必须先读取此文件。
> 格式：日期 | 修改文件 | 修改位置(行号) | 修改内容 | 原因

---

## 2026-06-15 恢复勾选功能

### page.tsx 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 第109-112行 | 新增4个useState | `includePairShield`, `includeBraidShield`, `includeCopperTape`, `includeGroundWire`，控制汇总中各分量是否计入总铜重 |
| 第367-395行 | 修改 `recalcSummary` 函数 | 根据勾选状态动态计算总铜重：`tw = tc + tn`，按勾选累加 tp/tb/tt/tg |
| 第398-402行 | 新增 useEffect | 监听4个勾选状态变化，自动重算汇总 |
| 第840-846行 | 对屏汇总卡片 | 改为带Checkbox的label，勾选时彩色，未勾选时灰色透明 |
| 第848行附近 | 总屏汇总卡片 | 同上模式，带Checkbox |
| 第855行附近 | 铜带汇总卡片 | 同上模式，带Checkbox |
| 第862行附近 | 接地线汇总卡片 | 同上模式，带Checkbox |
| 表格每行总铜重列 | 动态计算 | 根据勾选状态计算每行的总铜重，而非固定用result.totalWeight |

### 关键代码 — 不可删除

```typescript
// 第109-112行：勾选状态变量（删除则勾选功能失效）
const [includePairShield, setIncludePairShield] = useState(true)
const [includeBraidShield, setIncludeBraidShield] = useState(true)
const [includeCopperTape, setIncludeCopperTape] = useState(true)
const [includeGroundWire, setIncludeGroundWire] = useState(true)

// 第379-384行：汇总总铜重计算逻辑（删除则总铜重不受勾选控制）
let tw = tc + tn
if (includePairShield) tw += tp
if (includeBraidShield) tw += tb
if (includeCopperTape) tw += tt
if (includeGroundWire) tw += tg

// 第398-402行：勾选变化自动重算（删除则勾选后不刷新数据）
useEffect(() => {
  if (batchResults.length > 0) { recalcSummary(batchResults) }
}, [includePairShield, includeBraidShield, includeCopperTape, includeGroundWire])
```

---

## 2026-06-15 型号匹配优先级 + DJYP2VP2R别名

### copper-calculator.ts 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 第655-666行 | MODEL_ALIASES映射表 | `DJYVPR→DJYVRP`, `DJYVRP→DJYPVP`, `DJYPVP2→DJYPVP`, `DJYP2VP2R→DJYP2VP2` 等 |
| 第672-705行 | `resolveModelAlias` 函数 | 链式解析型号别名，支持精确匹配+清理后匹配+正则兜底 |
| 第711-714行 | `resolveModelDisplayName` 函数 | 只做第一步名称转换（如 DJYVPR→DJYVRP） |

### route.ts 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 第143-185行 | 策略1：物料型号优先 | 物料信息解析出的型号优先于UI下拉框选中的modelId |
| 第286行 | `matchedModelName` 标记 | 在result中标记实际匹配的数据表型号 |
| 第288-301行 | `aliasNote` 别名映射提示 | 显示如"DJYVPR→DJYVRP(套用DJYPVP)" |

---

## 2026-06-15 对绞规格显示优化

### page.tsx 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 结果表格规格列 | 显示对绞格式 | 4×2×1.5 而非 8×1.5 |
| 结果表格型号列 | 显示实际匹配型号名+别名提示 | 如"DJYP2VP2"或"DJYVPR→DJYVRP(套用DJYPVP)" |

---

## 2026-06-14 DJYP2VP2型号支持

### copper-calculator.ts 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 第253-266行 | 对屏铜带判断 | `pairWireDiameter > 1` → 铜带对屏（每对重量kg/km）；`<= 1` → 编织对屏 |
| 第286-300行 | 接地线双层计算 | 接地线1始终用公式，接地线2优先用per-km值 |
| 第138-155行 | MODEL_BRAID_COVERAGE | RS485编织密度95%（K=0.7764） |

### route.ts 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 第95-98行 | modelSpecsCache | 按需加载specs缓存，避免内存溢出 |
| 第366-385行 | 对屏铜带判断 | 与copper-calculator.ts逻辑一致 |

---

## 2026-06-13 YJV格式解析修复

### copper-calculator.ts 修改

| 位置 | 修改内容 | 说明 |
|------|----------|------|
| 第430-450行 | pattern1b | 新增"型号 电压 复合规格"格式匹配 |
| 第454行 | pattern2电压匹配 | `KV?` 改为 `[Kk]?[Vv]?`，支持"450/750V"格式 |

---

## 2026-06-12 多型号参数库 + Excel导入

### 数据库新增

- Prisma Schema：CableModel + CableSpec 两表
- 型号表字段：name, displayName, category, hasConductor, hasBraidShield, hasCopperTape, defaultShieldType
- 规格表字段：spec, conductorDiameter, coreCount, copperDensity, wrapDiameter, wireDiameter, copperTapeWeightPerKm + 中性/对屏/接地线字段

### 新增文件

- `src/app/api/cable-models/route.ts` — 型号CRUD接口
- `src/app/api/cable-models/specs/route.ts` — 规格CRUD接口
- `src/app/api/cable-models/import/route.ts` — Excel导入接口

### 数据库现有型号

| 型号 | 规格数 | 说明 |
|------|--------|------|
| KVVP | 147 | 控制电缆，编织屏蔽+铜带 |
| BVR | 19 | 布电线，无屏蔽 |
| YJV | 121 | 电力电缆，含中性导体 |
| DJYPVP | 210 | 计算机电缆A类，编织对屏+编织总屏 |
| DJYPVP-B | 210 | 计算机电缆B类，编织对屏+编织总屏 |
| BPYJVP | 32 | 变频电缆，编织屏蔽 |
| DJYP2VP2 | 210 | 计算机电缆，铜带对屏+铜带总屏 |

---

## 2026-06-11 初始版本

### 核心文件

- `src/lib/cable-data.json` — KVVP 147种规格数据
- `src/lib/copper-calculator.ts` — 计算公式模块
- `src/app/api/copper/route.ts` — API路由
- `src/app/page.tsx` — 前端页面

### 计算公式

- 导体重量(kg) = d² × 0.785 × ρ × n × L / 1000
- 编织屏蔽重量(kg) = I × (H + 2I) × K × 1.05 × 8.9 × π²/2 × L / 1000 (K=0.5528即80%密度)
- 铜带(P2)重量(kg) = 铜带重(km) / 1000 × L
- 中性导体重量(kg) = 同导体公式
- 对屏重量(kg) = 编织公式 或 铜带公式（按型号判断）
- 接地线重量(kg) = 同导体公式 或 per-km值

---

> ⚠️ **AI注意**：修改任何代码前，先读取本文件了解该区域的历史修改，避免误删已实现功能！
