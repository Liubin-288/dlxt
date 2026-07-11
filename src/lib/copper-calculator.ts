/**
 * 电缆铜重计算模块
 * 
 * 支持型号：KVVP, BVR, YJV, DJYPVP 等
 * 
 * 计算公式：
 * - 导体重量(kg) = 单丝直径² × 0.785 × 铜比重 × 单丝根数×导体数 × 长度(m) / 1000
 * - 编织屏蔽重量(kg) = 丝材直径 × (绕包后外径 + 2×丝材直径) × 0.5528 × 1.05 × 8.9 × π²/2 × 长度(m) / 1000
 * - 铜带(P2)重量(kg) = 铜带重量(km) / 1000 × 长度(m)
 * - 中性导体重量(kg) = 中性丝径² × 0.785 × 铜比重 × 中性根数×中性芯数 × 长度(m) / 1000
 * - 对屏重量(kg) = 对屏丝径 × (对屏绕包外径 + 2×对屏丝径) × 0.5528 × 1.05 × 8.9 × π²/2 × 长度(m) / 1000
 * - 接地线重量(kg) = 接地线丝径² × 0.785 × 铜比重 × 根数 × 长度(m) / 1000
 * - 总铜重(kg) = 导体重量 + 中性导体重量 + 对屏重量 + 总屏重量 + 铜带(P2)重量 + 接地线重量
 */

export interface CableSpec {
  model: string;           // 型号 (KVVP, BVR, YJV, DJYPVP 等)
  spec: string;            // 规格 (如 14*2.5, 1*6, 3*35+1*16, 2*2*0.5 等)
  conductorDiameter: number; // 导体单丝直径 (mm)
  coreCount: number;       // 等效芯数（单丝根数×导体数）
  copperDensity: number;   // 铜比重 (g/cm³, 默认8.9)
  // 总屏参数
  wrapDiameter: number;    // 绕包后外径/屏蔽前外径 (mm) - 总屏用
  wireDiameter: number;    // 丝材直径 (mm) - 总屏用
  copperTapeWeightPerKm: number; // 铜带重量 (kg/km) - 总屏铜带
  // 中性导体参数（YJV等电力电缆 3+1/4+1芯的N线）
  neutralCoreCount?: number;     // 中性导体芯数
  neutralWireCount?: number;     // 中性导体单丝根数
  neutralWireDiameter?: number;  // 中性导体单丝直径 (mm)
  // 对屏参数（DJYPVP等计算机电缆）
  pairCount?: number;            // 对数
  coresPerPair?: number;         // 每对芯数
  pairWrapDiameter?: number;     // 对屏绕包前外径 (mm)
  pairWireDiameter?: number;     // 对屏丝材直径 (mm)
  // 接地线参数（DJYPVP等计算机电缆）
  groundWire1Diameter?: number;  // 接地线1丝径 (mm)
  groundWire1Count?: number;     // 接地线1根数
  groundWire2Diameter?: number;  // 接地线2丝径 (mm)
  groundWire2Count?: number;     // 接地线2根数
  groundWireWeightPerKm?: number; // 接地线总重量 (kg/km) - 从Excel直接导入
  // 铜带替代重量（当P2时的总屏铜带重量）
  tapeShieldWeightPerKm?: number; // 总屏铜带替代重量 (kg/km)
}

export interface CopperWeightResult {
  spec: string;                  // 规格标识
  lengthM: number;               // 长度(米)
  conductorWeight: number;       // 主导体铜重 (kg)
  neutralConductorWeight: number; // 中性导体铜重 (kg)
  pairShieldWeight: number;      // 对屏铜重 (kg) - DJYPVP等计算机电缆
  braidShieldWeight: number;     // 总屏编织屏蔽铜重 (kg)
  copperTapeWeight: number;      // 总屏铜带(P2)铜重 (kg)
  groundWireWeight: number;      // 接地线铜重 (kg)
  totalWeight: number;           // 总铜重 (kg)
  // 明细参数
  conductorDiameter: number;
  coreCount: number;
  wrapDiameter: number;
  wireDiameter: number;
  shieldType: 'braid' | 'tape' | 'both' | 'none'; // 屏蔽类型(总屏)
}

/**
 * 标准导体截面→单丝丝径×根数映射表（GB/T 3956 第1类/第2类导体）
 * 用于当规格含+（复合规格）但中性参数为空时自动推算中性铜重
 */
const NEUTRAL_SECTION_MAP: Record<number, { wireDiameter: number; wireCount: number }> = {
  0.5:  { wireDiameter: 0.80, wireCount: 1 },
  0.75: { wireDiameter: 0.97, wireCount: 1 },
  1.0:  { wireDiameter: 1.14, wireCount: 1 },
  1.5:  { wireDiameter: 1.38, wireCount: 1 },
  2.5:  { wireDiameter: 1.76, wireCount: 1 },
  4:    { wireDiameter: 2.22, wireCount: 1 },
  6:    { wireDiameter: 2.74, wireCount: 1 },
  10:   { wireDiameter: 1.34, wireCount: 7 },
  16:   { wireDiameter: 1.68, wireCount: 7 },
  25:   { wireDiameter: 2.12, wireCount: 7 },
  35:   { wireDiameter: 2.48, wireCount: 7 },
  50:   { wireDiameter: 2.51, wireCount: 10 },
  70:   { wireDiameter: 2.51, wireCount: 14 },
  95:   { wireDiameter: 2.51, wireCount: 19 },
  120:  { wireDiameter: 2.51, wireCount: 24 },
  150:  { wireDiameter: 2.51, wireCount: 30 },
  185:  { wireDiameter: 2.51, wireCount: 37 },
  240:  { wireDiameter: 2.51, wireCount: 48 },
}

/**
 * 从复合规格字符串解析中性参数（如 "3*10+3*1.5" → {neutralCoreCount:3, neutralCrossSection:1.5}）
 */
export function parseNeutralFromSpec(spec: string): { neutralCoreCount: number; neutralCrossSection: number } | null {
  if (!spec.includes('+')) return null
  const parts = spec.split('+')
  if (parts.length < 2) return null
  const neutralPart = parts[1].trim()
  const ns = neutralPart.split('*')
  if (ns.length < 2) return null
  const neutralCoreCount = parseInt(ns[0]) || 0
  const neutralCrossSection = parseFloat(ns[1]) || 0
  if (neutralCoreCount > 0 && neutralCrossSection > 0) {
    return { neutralCoreCount, neutralCrossSection }
  }
  return null
}

/**
 * 根据截面积查找标准丝径和根数
 */
export function getNeutralWireInfo(crossSection: number): { wireDiameter: number; wireCount: number } | null {
  return NEUTRAL_SECTION_MAP[crossSection] || null
}

/**
 * 计算导体铜重 (kg)
 * 公式: d² × π/4 × ρ × n × L / 1000
 */
export function calcConductorWeight(
  conductorDiameter: number, // 单丝直径 mm
  coreCount: number,         // 等效芯数
  copperDensity: number,     // 铜比重 g/cm³
  lengthM: number            // 长度 m
): number {
  const d = conductorDiameter;
  const n = coreCount;
  const rho = copperDensity;
  const L = lengthM;
  return d * d * Math.PI / 4 * rho * n * L / 1000;
}

/**
 * 型号对应的编织覆盖系数（单向覆盖系数K）
 * 编织密度 f = K × (2 - K)
 * 80%密度 → K = 0.5528
 * 85%密度 → K = 0.6127
 * 90%密度 → K = 0.6838
 * 95%密度 → K = 0.7764
 */
const MODEL_BRAID_COVERAGE: Record<string, number> = {
  'RS485': 0.7764,     // 95%编织密度
}

/**
 * 获取型号的编织覆盖系数K
 * 默认返回0.5528（80%编织密度）
 */
export function getBraidCoverageFactor(modelName: string): number {
  if (!modelName) return 0.5528
  // 精确匹配
  if (MODEL_BRAID_COVERAGE[modelName]) return MODEL_BRAID_COVERAGE[modelName]
  // 前缀匹配（如 RS485-xxx）
  for (const [key, value] of Object.entries(MODEL_BRAID_COVERAGE)) {
    if (modelName.startsWith(key)) return value
  }
  return 0.5528  // 默认80%密度
}

/**
 * 计算编织屏蔽铜重 (kg)
 * 公式: I × (H + 2I) × K × 1.05 × 8.9 × π²/2 × L / 1000
 * K = 单向覆盖系数（默认0.5528即80%密度）
 */
export function calcBraidShieldWeight(
  wireDiameter: number,   // 丝材直径 mm
  wrapDiameter: number,   // 绕包后外径 mm
  lengthM: number,        // 长度 m
  coverageFactor?: number // 单向覆盖系数K（可选，默认0.5528即80%密度）
): number {
  const I = wireDiameter;
  const H = wrapDiameter;
  const L = lengthM;
  const K = coverageFactor ?? 0.5528;
  const PI = Math.PI;
  return I * (H + 2 * I) * K * 1.05 * 8.9 * PI * PI / 2 * L / 1000;
}

/**
 * 计算铜带(P2)铜重 (kg)
 * 公式: 铜带重量(km) / 1000 × L
 */
export function calcCopperTapeWeight(
  copperTapeWeightPerKm: number, // 铜带重量 kg/km
  lengthM: number                // 长度 m
): number {
  return copperTapeWeightPerKm / 1000 * lengthM;
}

/**
 * 计算接地线铜重 (kg)
 * 公式: d² × 0.785 × ρ × n × L / 1000 (与导体公式相同)
 */
export function calcGroundWireWeight(
  wireDiameter: number,   // 接地线丝径 mm
  wireCount: number,      // 接地线根数
  copperDensity: number,  // 铜比重 g/cm³
  lengthM: number         // 长度 m
): number {
  if (!wireDiameter || !wireCount) return 0;
  return calcConductorWeight(wireDiameter, wireCount, copperDensity, lengthM);
}

/**
 * 完整铜重计算（兼容原有型号 + DJYPVP计算机电缆）
 */
export function calcTotalCopperWeight(
  spec: CableSpec,
  lengthM: number,
  shieldType: 'braid' | 'tape' | 'both' | 'none' = 'tape',
  originalModel?: string  // 原始型号（别名解析前），用于判断是否跳过对屏
): CopperWeightResult {
  // 主导体重量
  const conductorWeight = calcConductorWeight(
    spec.conductorDiameter,
    spec.coreCount,
    spec.copperDensity,
    lengthM
  );

  // 中性导体重量
  let neutralConductorWeight = 0;
  if (spec.neutralWireCount && spec.neutralWireDiameter && spec.neutralCoreCount) {
    // 优先使用数据库中的中性参数
    const neutralEquivalentCount = spec.neutralWireCount * spec.neutralCoreCount;
    neutralConductorWeight = calcConductorWeight(
      spec.neutralWireDiameter,
      neutralEquivalentCount,
      spec.copperDensity,
      lengthM
    );
  } else if (spec.spec.includes('+')) {
    // 数据库中性参数为空，但规格为复合规格（如 "3*10+3*1.5"），自动从中性部分推算
    const neutralInfo = parseNeutralFromSpec(spec.spec);
    if (neutralInfo) {
      const wireInfo = getNeutralWireInfo(neutralInfo.neutralCrossSection);
      if (wireInfo) {
        const neutralEquivalentCount = wireInfo.wireCount * neutralInfo.neutralCoreCount;
        neutralConductorWeight = calcConductorWeight(
          wireInfo.wireDiameter,
          neutralEquivalentCount,
          spec.copperDensity,
          lengthM
        );
      }
    }
  }

  // 获取型号对应的编织覆盖系数K
  const coverageFactor = originalModel ? getBraidCoverageFactor(originalModel) : 0.5528

  // 对屏重量（DJYPVP等计算机电缆每对线对的编织屏蔽）
  // DJYVPR/DJYVRP：忽略对屏，只算总屏
  let pairShieldWeight = 0;
  const skipPair = originalModel ? shouldSkipPairShield(originalModel) : false;
  if (!skipPair && spec.pairWrapDiameter && spec.pairWireDiameter && spec.pairCount && spec.pairCount > 0) {
    // DJYP2VP2等型号：对屏使用铜带，pairWireDiameter存储的是每对铜带重量(kg/km)
    // 判断依据：pairWireDiameter > 1 → 铜带重量(kg/km)；<= 1 → 编织丝径(mm)
    const isPairTape = spec.pairWireDiameter > 1;
    if (isPairTape) {
      // 铜带对屏：pairWireDiameter存的是每对铜带重量(kg/km)
      const singlePairWeight = spec.pairWireDiameter / 1000 * lengthM;
      pairShieldWeight = singlePairWeight * spec.pairCount;  // 对屏总重 = 每对重 × 对数
    } else {
      // 编织对屏：pairWireDiameter存的是丝径(mm)
      const singlePairWeight = calcBraidShieldWeight(spec.pairWireDiameter, spec.pairWrapDiameter, lengthM, coverageFactor);
      pairShieldWeight = singlePairWeight * spec.pairCount;  // 对屏总重 = 每对重 × 对数
    }
  }

  // 总屏编织屏蔽重量
  const braidShieldWeight = (shieldType === 'braid' || shieldType === 'both')
    ? calcBraidShieldWeight(spec.wireDiameter, spec.wrapDiameter, lengthM, coverageFactor)
    : 0;

  // 总屏铜带重量
  // 【死规则】只有型号名包含 P2 才计算铜带重量，与 shieldType 无关
  let copperTapeWeight = 0;
  if (hasCopperTape(originalModel) && (shieldType === 'tape' || shieldType === 'both')) {
    // 优先使用 tapeShieldWeightPerKm（DJYPVP2的铜带替代重量）
    if (spec.tapeShieldWeightPerKm && spec.tapeShieldWeightPerKm > 0) {
      copperTapeWeight = calcCopperTapeWeight(spec.tapeShieldWeightPerKm, lengthM);
    } else {
      copperTapeWeight = calcCopperTapeWeight(spec.copperTapeWeightPerKm, lengthM);
    }
  }

  // 接地线重量：RS485跳过（只需主导体+总屏蔽）
  let groundWireWeight = 0;
  const skipGround = originalModel ? shouldSkipGroundWire(originalModel) : false;
  if (!skipGround) {
    // 接地线1（对屏区域的接地线）：始终用公式计算
    // DJYP2VP2等多对规格有接地线1，1对规格无接地线1
    const density = spec.copperDensity;
    if (spec.groundWire1Diameter && spec.groundWire1Count) {
      groundWireWeight += calcGroundWireWeight(spec.groundWire1Diameter, spec.groundWire1Count, density, lengthM);
    }
    // 接地线2（总屏区域的接地线）：优先用per-km重量，否则用公式计算
    if (spec.groundWireWeightPerKm && spec.groundWireWeightPerKm > 0) {
      groundWireWeight += spec.groundWireWeightPerKm / 1000 * lengthM;
    } else if (spec.groundWire2Diameter && spec.groundWire2Count) {
      groundWireWeight += calcGroundWireWeight(spec.groundWire2Diameter, spec.groundWire2Count, density, lengthM);
    }
  }

  const totalWeight = conductorWeight + neutralConductorWeight + pairShieldWeight + braidShieldWeight + copperTapeWeight + groundWireWeight;

  return {
    spec: `${spec.model} ${spec.spec}`,
    lengthM,
    conductorWeight: round4(conductorWeight),
    neutralConductorWeight: round4(neutralConductorWeight),
    pairShieldWeight: round4(pairShieldWeight),
    braidShieldWeight: round4(braidShieldWeight),
    copperTapeWeight: round4(copperTapeWeight),
    groundWireWeight: round4(groundWireWeight),
    totalWeight: round4(totalWeight),
    conductorDiameter: spec.conductorDiameter,
    coreCount: spec.coreCount,
    wrapDiameter: spec.wrapDiameter,
    wireDiameter: spec.wireDiameter,
    shieldType,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * 从物料信息字符串解析规格
 * 
 * 支持多种格式：
 * 1. 前缀-型号 电压 规格: "ZA-KVVP2-22 450/750V 14×2.5" / "ZA-YJV22 0.6/1KV 3×35+1×16"
 * 1b. 型号 电压 规格: "YJV 0.6/1KV 3×35+1×16" / "YJV22 0.6/1KV 4×50+1×25" / "DJYPVP 450/750V 2×2×0.5"
 * 2. 型号 电压 截面积: "BVR 450/750V 6"
 * 3. 型号 规格: "YJV 3×35+1×16" / "KVVP 14×2.5" / "DJYPVP 2×2×0.5"
 * 4. 型号 截面积: "BVR 6"
 * 5. 纯规格: "3×35+1×16" / "14×2.5" / "2×2×0.5"
 * 6. 纯截面积: "6"
 * 
 * DJYPVP专用: "DJYPVP 2×2×0.5" → 对数=2, 每对芯数=2, 截面积=0.5
 */
// 解析结果类型
export type ParsedMaterialInfo = {
  prefix: string;       // 前缀 (ZA, ZB, NH, WDZ等)
  model: string;        // 型号 (KVVP2-22, YJV22, BVR, DJYPVP等)
  voltage: string;      // 电压等级
  cores: number;        // 主导体芯数(或总芯数)
  crossSection: number; // 主导体截面积 mm²
  neutralCores?: number;      // 中性导体芯数
  neutralCrossSection?: number; // 中性导体截面积 mm²
  specStr?: string;     // 完整规格字符串(如 "3*35+1*16", "2*2*0.5")
  pairCount?: number;   // 对数(DJYPVP等计算机电缆)
  coresPerPair?: number; // 每对芯数
};

// 已知的阻燃/耐火/无卤低烟前缀（按长度降序，先匹配长前缀避免误判）
const KNOWN_MODEL_PREFIXES = ['WDZ', 'WDZN', 'ZA', 'ZB', 'ZC', 'NH', 'ZR', 'DDZ', 'DL'];

/**
 * 剥离型号前的阻燃/耐火前缀（如 WDZ-DJYJPYP2 → prefix=WDZ, model=DJYJPYP2）
 * 用于兼容用户输入无电压等级时整体被解析为 model 的情况
 */
function stripKnownPrefix(raw: ParsedMaterialInfo): ParsedMaterialInfo {
  // 已经有显式 prefix（pattern1 命中 WDZ-XXX 格式）时不再剥离
  if (raw.prefix && raw.prefix !== raw.model) return raw
  
  for (const p of KNOWN_MODEL_PREFIXES) {
    // 形如 "WDZ-DJYJPYP2"
    if (raw.model.startsWith(p + '-')) {
      return { ...raw, prefix: p, model: raw.model.slice(p.length + 1) }
    }
    // 形如 "WDZDJYJPYP2"（无连字符）
    if (raw.model.startsWith(p) && raw.model.length > p.length) {
      const rest = raw.model.slice(p.length)
      // 仅当剩余部分以大写字母开头时才剥离，避免误判（如 ZA 本身就是一个完整型号）
      if (/^[A-Z]/.test(rest)) {
        return { ...raw, prefix: p, model: rest }
      }
    }
  }
  return raw
}

function parseMaterialInfoRaw(materialInfo: string): ParsedMaterialInfo | null {
  const str = materialInfo.trim()
  if (!str) return null

  // 复合规格解析函数: "3×35+1×16" -> { mainCores, mainSection, neutralCores, neutralSection }
  const parseComplexSpec = (specPart: string) => {
    // 匹配 "3×35+1×16" 或 "4*50+1*25" 或 "3×35+2×16"
    const complexPattern = /^(\d+)[×x*](\d+(?:\.\d+)?)[+](\d+)[×x*](\d+(?:\.\d+)?)$/;
    const match = specPart.match(complexPattern);
    if (match) {
      return {
        mainCores: parseInt(match[1]),
        mainSection: parseFloat(match[2]),
        neutralCores: parseInt(match[3]),
        neutralSection: parseFloat(match[4]),
        specStr: `${match[1]}*${match[2]}+${match[3]}*${match[4]}`,
        pairCount: undefined as number | undefined,
        coresPerPair: undefined as number | undefined,
      };
    }
    // 对绞规格 "2×2×0.5" → 对数=2, 每对芯数=2, 截面积=0.5
    // "1×2×1.5" → 对数=1, 每对芯数=2, 截面积=1.5（1对规格在数据库中存为"2*1.5"）
    const pairPattern = /^(\d+)[×x*](\d+)[×x*](\d+(?:\.\d+)?)$/;
    const pairMatch = specPart.match(pairPattern);
    if (pairMatch) {
      const pairCount = parseInt(pairMatch[1]);
      const coresPerPair = parseInt(pairMatch[2]);
      const crossSection = parseFloat(pairMatch[3]);
      return {
        mainCores: pairCount * coresPerPair, // 总芯数 = 对数 × 每对芯数
        mainSection: crossSection,
        neutralCores: undefined as number | undefined,
        neutralSection: undefined as number | undefined,
        // 1对规格: specStr = "2*1.5"（不含对数前缀，与数据库一致）
        // 多对规格: specStr = "2*2*0.5"（含对数前缀）
        specStr: pairCount > 1 ? `${pairCount}*${coresPerPair}*${crossSection}` : `${coresPerPair}*${crossSection}`,
        pairCount,
        coresPerPair,
      };
    }
    // 简单规格 "14×2.5"
    const simplePattern = /^(\d+)[×x*](\d+(?:\.\d+)?)$/;
    const simpleMatch = specPart.match(simplePattern);
    if (simpleMatch) {
      return {
        mainCores: parseInt(simpleMatch[1]),
        mainSection: parseFloat(simpleMatch[2]),
        neutralCores: undefined as number | undefined,
        neutralSection: undefined as number | undefined,
        specStr: `${simpleMatch[1]}*${simpleMatch[2]}`,
        pairCount: undefined as number | undefined,
        coresPerPair: undefined as number | undefined,
      };
    }
    return null;
  };

  // === 格式1: 前缀-型号 电压 复合/简单规格 ===
  const pattern1 = /^([A-Z]{2,3})-([A-Z0-9-]+)\s+([\d/.]+[Kk]?[Vv]?)\s+([\d×x*+.]+)\s*(.*)$/;
  const match1 = str.match(pattern1);
  if (match1) {
    const specPart = match1[4].replace(/×/g, '*');
    const parsed = parseComplexSpec(specPart);
    if (parsed) {
      return {
        prefix: match1[1],
        model: match1[2],
        voltage: match1[3],
        cores: parsed.mainCores,
        crossSection: parsed.mainSection,
        neutralCores: parsed.neutralCores,
        neutralCrossSection: parsed.neutralSection,
        specStr: parsed.specStr,
        pairCount: parsed.pairCount,
        coresPerPair: parsed.coresPerPair,
      };
    }
  }

  // === 格式1b: 型号 电压 复合/简单规格 (无前缀-连字符) ===
  const pattern1b = /^([A-Z][A-Z0-9-]+?)\s+([\d/.]+[Kk]?[Vv]?)\s+([\d×x*+.]+)\s*(.*)$/;
  const match1b = str.match(pattern1b);
  if (match1b) {
    const specPart = match1b[3].replace(/×/g, '*');
    const parsed = parseComplexSpec(specPart);
    if (parsed) {
      return {
        prefix: match1b[1],
        model: match1b[1],
        voltage: match1b[2],
        cores: parsed.mainCores,
        crossSection: parsed.mainSection,
        neutralCores: parsed.neutralCores,
        neutralCrossSection: parsed.neutralSection,
        specStr: parsed.specStr,
        pairCount: parsed.pairCount,
        coresPerPair: parsed.coresPerPair,
      };
    }
  }

  // === 格式2: 型号 电压 截面积 (BVR等单芯线) ===
  // 电压必须包含V或/，避免把 "RVVP2 10×2.5" 中的2误匹配为电压
  const pattern2 = /^([A-Z][A-Z0-9-]+)\s*[-]?\s*([\d/.]+[Kk]?[Vv])\s+(\d+(?:\.\d+)?)/;
  const match2 = str.match(pattern2);
  if (match2) {
    return {
      prefix: match2[1],
      model: match2[1],
      voltage: match2[2],
      cores: 1,
      crossSection: parseFloat(match2[3]),
    };
  }

  // === 格式3: 型号 复合/简单规格 (无电压，可能有长度后缀) ===
  const pattern3 = /^([A-Z][A-Z0-9-]+)\s+([\d×x*+.]+)(?:\s+.*)?$/;
  const match3 = str.match(pattern3);
  if (match3) {
    const specPart = match3[2].replace(/×/g, '*');
    const parsed = parseComplexSpec(specPart);
    if (parsed) {
      return {
        prefix: match3[1],
        model: match3[1],
        voltage: '',
        cores: parsed.mainCores,
        crossSection: parsed.mainSection,
        neutralCores: parsed.neutralCores,
        neutralCrossSection: parsed.neutralSection,
        specStr: parsed.specStr,
        pairCount: parsed.pairCount,
        coresPerPair: parsed.coresPerPair,
      };
    }
  }

  // === 格式4: 型号 截面积 (BVR等，无电压) ===
  const pattern4 = /^([A-Z][A-Z0-9-]+)\s+(\d+(?:\.\d+)?)/;
  const match4 = str.match(pattern4);
  if (match4) {
    return {
      prefix: match4[1],
      model: match4[1],
      voltage: '',
      cores: 1,
      crossSection: parseFloat(match4[2]),
    };
  }

  // === 格式5: 纯复合/简单规格 ===
  const pattern5 = /^([\d×x*+.]+)$/;
  const match5 = str.match(pattern5);
  if (match5) {
    const specPart = match5[1].replace(/×/g, '*');
    const parsed = parseComplexSpec(specPart);
    if (parsed) {
      return {
        prefix: '',
        model: '',
        voltage: '',
        cores: parsed.mainCores,
        crossSection: parsed.mainSection,
        neutralCores: parsed.neutralCores,
        neutralCrossSection: parsed.neutralSection,
        specStr: parsed.specStr,
        pairCount: parsed.pairCount,
        coresPerPair: parsed.coresPerPair,
      };
    }
  }

  // === 格式6: 纯截面积 ===
  const pattern6 = /^(\d+(?:\.\d+)?)$/;
  const match6 = str.match(pattern6);
  if (match6) {
    return {
      prefix: '',
      model: '',
      voltage: '',
      cores: 1,
      crossSection: parseFloat(match6[1]),
    };
  }

  return null;
}

/**
 * 解析物料信息（公开接口）
 * 在原始解析的基础上，额外剥离型号前的阻燃/耐火前缀（如 WDZ-DJYJPYP2 → prefix=WDZ, model=DJYJPYP2）
 * 解决用户输入无电压等级时整体被解析为 model 的问题
 */
export function parseMaterialInfo(materialInfo: string): ParsedMaterialInfo | null {
  const raw = parseMaterialInfoRaw(materialInfo)
  if (!raw) return null
  return stripKnownPrefix(raw)
}

/**
 * 标准化规格字符串中的数字格式
 * "4*0.50" → "4*0.5", "10*1.0" → "10*1", "3*35+1*16.0" → "3*35+1*16"
 */
export function normalizeSpecStr(spec: string): string {
  return spec.replace(/(\d+\.\d+)/g, (match) => {
    const num = parseFloat(match);
    return Number.isInteger(num) ? num.toString() : match.replace(/0+$/, '').replace(/\.$/, '');
  });
}

/**
 * 生成规格字符串的所有可能变体（用于模糊匹配）
 * "4*0.5" → ["4*0.5", "4*0.50", "4*0.500"]
 * "10*1" → ["10*1", "10*1.0", "10*1.00"]
 */
export function specVariants(spec: string): string[] {
  const variants = new Set<string>()
  variants.add(spec)
  variants.add(normalizeSpecStr(spec))
  
  const parts = spec.split(/([*+])/)
  const allVariantParts: string[][] = parts.map(part => {
    const num = parseFloat(part)
    if (isNaN(num)) return [part]
    
    const v = new Set<string>()
    if (Number.isInteger(num)) {
      v.add(num.toString())
      v.add(num.toFixed(1))
      v.add(num.toFixed(2))
    } else {
      v.add(num.toString())
      v.add(num.toFixed(1))
      v.add(num.toFixed(2))
      const normalized = normalizeSpecStr(part)
      v.add(normalized)
    }
    return [...v]
  })
  
  function combine(index: number, current: string[]): string[] {
    if (index === allVariantParts.length) {
      return [current.join('')]
    }
    const results: string[] = []
    for (const variant of allVariantParts[index]) {
      results.push(...combine(index + 1, [...current, variant]))
    }
    return results
  }
  
  combine(0, []).forEach(v => variants.add(v))
  return [...variants]
}

/**
 * 在规格列表中查找匹配的规格（支持小数格式模糊匹配 + 1对规格归一化）
 */
export function findSpecFuzzy(specs: CableSpec[], specStr: string): CableSpec | null {
  // 0. 1对规格归一化: "1*2*1.5" → "2*1.5"（数据库1对规格不含对数前缀）
  const pairNorm = specStr.replace(/^1\*(\d+\*\d+(?:\.\d+)?)$/, '$1')
  
  // 1. 精确匹配
  const exact = specs.find(s => s.spec === specStr || s.spec === pairNorm)
  if (exact) return exact
  
  // 2. 标准化后匹配
  const normalized = normalizeSpecStr(specStr)
  const pairNormNormalized = normalizeSpecStr(pairNorm)
  const normMatch = specs.find(s => normalizeSpecStr(s.spec) === normalized || normalizeSpecStr(s.spec) === pairNormNormalized)
  if (normMatch) return normMatch
  
  // 3. 用变体匹配
  const variants = specVariants(specStr)
  const pairNormVariants = specVariants(pairNorm)
  const allVariants = [...variants, ...pairNormVariants]
  for (const v of allVariants) {
    const found = specs.find(s => s.spec === v)
    if (found) return found
  }
  
  return null
}

/**
 * 根据规格字符串查找匹配的规格
 */
export function findSpec(
  specs: CableSpec[],
  cores: number,
  crossSection: number,
  neutralCores?: number,
  neutralCrossSection?: number
): CableSpec | null {
  let specStr: string;
  if (neutralCores && neutralCrossSection) {
    specStr = `${cores}*${crossSection}+${neutralCores}*${neutralCrossSection}`;
  } else {
    specStr = `${cores}*${crossSection}`;
  }
  return specs.find(s => s.spec === specStr) || null;
}

/**
 * 型号别名映射：支持链式解析
 * 
 * 第一步映射（名称转换）：
 *   DJYVPR → DJYVRP  （ZA-DJYVPR先转成DJYVRP）
 *   DJYJPVPR → DJYVPR （DJYJPVPR先转成DJYVPR，再走DJYVRP→DJYPVP链）
 *   DJYJPYPR → DJYVPR （DJYJPYPR是DJYJPVPR的PYP/PVP变体写法）
 *
 * 第二步映射（数据查找）：
 *   DJYVRP → DJYPVP  （DJYVRP套用DJYPVP数据，忽略对屏只算总屏）
 *   DJYVVP → DJYPVP  （DJYVVP套用DJYPVP数据，保留对屏+总屏，无接地线）
 *   DJYVVPR → DJYVRP （DJYVVPR先转DJYVRP，再走DJYVRP→DJYPVP链，无对屏）
 *   DJYJPVP → DJYPVP （DJYJPVP套用DJYPVP数据，保留对屏+总屏，但无接地线）
 *   DJYJPYP → DJYPVP （DJYJPYP是DJYJPVP的PYP/PVP变体写法，同样套用DJYPVP）
 *   DJYJPVP2 → DJYPVP （DJYJPVP2套用DJYPVP数据，总屏用铜带）
 *   DJYJPYP2 → DJYPVP （DJYJPYP2是DJYJPVP2的PYP/PVP变体写法）
 *   DJYPVRP → DJYPVP （DJYPVRP套用DJYPVP数据，保留对屏+总屏，无接地线）
 *   DJVPVP → DJYPVP  （DJVPVP套用DJYPVP数据，保留对屏+总屏，无接地线）
 *   DJVPVPR → DJYPVP （DJVPVPR套用DJYPVP数据，保留对屏+总屏，无接地线）
 *   DJYPVP2 → DJYPVP （DJYPVP2套用DJYPVP数据，总屏用铜带）
 *   RVVP → KVVP      （RVVP用KVVP数据）
 *   RVVP2 → KVVP2    （RVVP2用KVVP2数据）
 */
const MODEL_ALIASES: Record<string, string> = {
  // 第一步：名称转换（*PR → *RP）
  'DJYVPR': 'DJYVRP',     // DJYVPR先转成DJYVRP
  'DJYVVPR': 'DJYVRP',    // DJYVVPR先转成DJYVRP
  'DJYJPVPR': 'DJYVPR',   // DJYJPVPR先转成DJYVPR，再走DJYVRP→DJYPVP链
  'DJYJPYPR': 'DJYVPR',   // DJYJPYPR（PYP变体）先转成DJYVPR，再走DJYVRP→DJYPVP链
  // 第二步：数据查找映射（无对屏类）
  'DJYVRP': 'DJYPVP',     // DJYVRP套用DJYPVP数据，忽略对屏只算总屏
  // 第二步：数据查找映射（有对屏+总屏类）
  'DJYVVP': 'DJYPVP',     // DJYVVP套用DJYPVP数据
  'DJYVP': 'DJYPVP',      // DJYVP套用DJYPVP数据，保留对屏+总屏，无接地线
  'DJYJPVP': 'DJYPVP',    // DJYJPVP套用DJYPVP数据，保留对屏+总屏，但无接地线
  'DJYJPYP': 'DJYPVP',    // DJYJPYP（PYP变体）同DJYJPVP
  'DJYJPVP2': 'DJYPVP',   // DJYJPVP2套用DJYPVP数据，总屏用铜带
  'DJYJPYP2': 'DJYPVP',   // DJYJPYP2（PYP变体）同DJYJPVP2
  'DJYPVRP': 'DJYPVP',    // DJYPVRP套用DJYPVP数据，保留对屏+总屏，无接地线
  'DJVPVP': 'DJYPVP',     // DJVPVP套用DJYPVP数据，保留对屏+总屏，无接地线
  'DJVPVPR': 'DJYPVP',    // DJVPVPR套用DJYPVP数据，保留对屏+总屏，无接地线
  'DJYPVP2': 'DJYPVP',    // DJYPVP2使用DJYPVP数据，但总屏用铜带
  'DJYPVPP2': 'DJYPVP',   // DJYPVPP2同上
  'DJYP2VP2R': 'DJYP2VP2', // DJYP2VP2R（软导体）用DJYP2VP2数据
  'RVVP': 'KVVP',         // RVVP用KVVP数据
  'RVVP2': 'KVVP2',       // RVVP2用KVVP2数据
  'RVS': 'RVS',           // RVS 无替代
}

/**
 * 获取型号的等效数据库型号（链式解析，直到无法再解析）
 * 如 DJYVPR → DJYVRP → DJYPVP（最终用DJYPVP查找数据）
 */
export function resolveModelAlias(model: string): string {
  const cleanModel = model.replace(/[-]/g, '').replace(/22$/, '')

  // 链式解析：跟随别名链直到终点
  let resolved = model
  const visited = new Set<string>()  // 防止循环
  while (true) {
    // 精确匹配
    if (MODEL_ALIASES[resolved] && !visited.has(resolved)) {
      visited.add(resolved)
      resolved = MODEL_ALIASES[resolved]
      continue
    }
    // 清理后匹配
    const cleaned = resolved.replace(/[-]/g, '').replace(/22$/, '')
    if (cleaned !== resolved && MODEL_ALIASES[cleaned] && !visited.has(cleaned)) {
      visited.add(cleaned)
      resolved = MODEL_ALIASES[cleaned]
      continue
    }
    break
  }

  if (resolved !== model) return resolved

  // 正则匹配兜底
  if (/^RVVP2/.test(model)) return model.replace(/^RVVP2/, 'KVVP2')
  if (/^RVVP/.test(model)) return model.replace(/^RVVP/, 'KVVP')
  // 含P2变体优先匹配（避免被普通分支提前命中）
  if (/^DJYJPYP2/.test(model)) return model.replace(/^DJYJPYP2/, 'DJYPVP')
  if (/^DJYJPVP2/.test(model)) return model.replace(/^DJYJPVP2/, 'DJYPVP')
  // R结尾的软型号（先转成DJYVRP再走链）
  if (/^DJYVVPR/.test(model)) return model.replace(/^DJYVVPR/, 'DJYVRP')
  if (/^DJYJPYPR/.test(model)) return model.replace(/^DJYJPYPR/, 'DJYVRP')
  if (/^DJYJPVPR/.test(model)) return model.replace(/^DJYJPVPR/, 'DJYVRP')
  if (/^DJYVPR/.test(model)) return model.replace(/^DJYVPR/, 'DJYVRP')
  // 有对屏+总屏类（B类）
  if (/^DJYJPYP/.test(model)) return model.replace(/^DJYJPYP/, 'DJYPVP')
  if (/^DJYJPVP/.test(model)) return model.replace(/^DJYJPVP/, 'DJYPVP')
  if (/^DJYPVRP/.test(model)) return model.replace(/^DJYPVRP/, 'DJYPVP')
  if (/^DJVPVPR/.test(model)) return model.replace(/^DJVPVPR/, 'DJYPVP')
  if (/^DJVPVP/.test(model)) return model.replace(/^DJVPVP/, 'DJYPVP')
  if (/^DJYVVP/.test(model)) return model.replace(/^DJYVVP/, 'DJYPVP')
  if (/^DJYVP/.test(model)) return model.replace(/^DJYVP/, 'DJYPVP')
  // 总屏铜带变体
  if (/^DJYPVP2/.test(model)) return model.replace(/^DJYPVP2/, 'DJYPVP')
  // 只总屏类
  if (/^DJYVRP/.test(model)) return model.replace(/^DJYVRP/, 'DJYPVP')

  return model
}

/**
 * 获取型号的显示名称（只做第一步名称转换）
 * DJYVPR / DJYVVPR → DJYVRP（显示转换后的名称）
 * DJYJPVPR / DJYJPYPR → DJYVPR（先转成DJYVPR，再转成DJYVRP）
 */
export function resolveModelDisplayName(model: string): string {
  if (/^DJYJPYPR/.test(model)) return model.replace(/^DJYJPYPR/, 'DJYVPR').replace(/^DJYVPR/, 'DJYVRP')
  if (/^DJYJPVPR/.test(model)) return model.replace(/^DJYJPVPR/, 'DJYVPR').replace(/^DJYVPR/, 'DJYVRP')
  if (/^DJYVVPR/.test(model)) return model.replace(/^DJYVVPR/, 'DJYVRP')
  if (/^DJYVPR/.test(model)) return model.replace(/^DJYVPR/, 'DJYVRP')
  return model
}

/**
 * 判断屏蔽类型（总屏类型）
 * DJYVPR/DJYVRP：只有总屏编织，无对屏 → 'braid'
 * DJYPVP: 对屏(编织) + 总屏(编织) → 'both'
 * DJYPVP2: 对屏(编织) + 总屏(铜带) → 'both'
 * 其他型号按原规则
 */
export function getShieldType(model: string): 'braid' | 'tape' | 'both' | 'none' {
  if (['BVR', 'BV', 'RV', 'RVV', 'BVV', 'RVB', 'RVS', 'YJV', 'VV', 'VV22', 'YJV22'].includes(model)) return 'none';
  // A类（无对屏，仅总屏编织）：DJYVRP / DJYVPR / DJYVVPR 及其子类
  if (/^DJYJPYPR/.test(model) || /^DJYJPVPR/.test(model) || /^DJYVVPR/.test(model) || /^DJYVPR/.test(model) || /^DJYVRP/.test(model)) return 'braid';
  // DJYP2VP2：对屏铜带 + 总屏铜带 → 'both'
  if (/^DJYP2VP2/.test(model)) return 'both';
  // B类（有对屏+总屏）：DJYVVP / DJYJPYP / DJYJPVP / DJYPVRP / DJVPVP / DJVPVPR / DJYPVP系列
  if (/^DJYJPYP2/.test(model)) return 'both';  // 对屏编织 + 总屏铜带
  if (/^DJYJPYP/.test(model)) return 'both';   // 对屏编织 + 总屏编织
  if (/^DJYJPVP2/.test(model)) return 'both';  // 对屏编织 + 总屏铜带
  if (/^DJYJPVP/.test(model)) return 'both';   // 对屏编织 + 总屏编织
  if (/^DJYPVRP/.test(model)) return 'both';   // 对屏编织 + 总屏编织
  if (/^DJVPVPR/.test(model)) return 'both';   // 对屏编织 + 总屏编织
  if (/^DJVPVP/.test(model)) return 'both';    // 对屏编织 + 总屏编织
  if (/^DJYVVP/.test(model)) return 'both';    // 对屏编织 + 总屏编织
  if (/^DJYVP/.test(model)) return 'both';     // 对屏编织 + 总屏编织
  if (/^DJYPVP2/.test(model)) return 'both';  // 对屏编织 + 总屏铜带
  if (/^DJYPVP/.test(model)) return 'both';    // 对屏编织 + 总屏编织
  // P2 → 铜带屏蔽，P（非P2）→ 编织屏蔽
  if (/P2/.test(model)) return 'tape';
  if (/P/.test(model)) return 'braid';
  return 'none';
}

/**
 * 【死规则】判断型号是否应计算铜带(P2)重量
 * 只有型号名包含 "P2" 时才有铜带重量，与 shieldType 无关。
 * 例如：
 *   - KVVP / DJYPVP / DJYJPYP / DJYVPR：不含 P2 → 铜带 = 0
 *   - KVVP2 / DJYPVP2 / DJYJPYP2 / DJYP2VP2 / DJYP2VP2R：含 P2 → 铜带正常计算
 *
 * 此规则用于覆盖 shieldType='both' 时铜带被默认计算的情况。
 * 因为 DJYJPYP / DJYJPVP 等型号虽然套用 DJYPVP 数据表（其中存有 copperTapeWeightPerKm），
 * 但型号本身没有 P2，铜带数据是给对应的 P2 变种（如 DJYJPYP2）备用的。
 */
export function hasCopperTape(model: string | undefined | null): boolean {
  if (!model) return false
  return /P2/.test(model)
}

/**
 * 判断型号是否有对屏（计算机电缆特征）
 */
export function hasPairShield(model: string): boolean {
  // A类（无对屏）：DJYVRP / DJYVPR / DJYVVPR 及其子类
  if (/^DJYJPYPR/.test(model) || /^DJYJPVPR/.test(model) || /^DJYVVPR/.test(model) || /^DJYVPR/.test(model) || /^DJYVRP/.test(model)) return false
  // B类（有对屏+总屏）：DJYVVP / DJYVP / DJYJPYP / DJYJPVP / DJYPVRP / DJVPVP / DJVPVPR / DJYPVP系列
  return /^DJYJPYP/.test(model) || /^DJYJPVP/.test(model) || /^DJYPVRP/.test(model) || /^DJVPVPR/.test(model) || /^DJVPVP/.test(model) || /^DJYVVP/.test(model) || /^DJYVP/.test(model) || /^DJYPVP/.test(model) || /^DJYP2VP2/.test(model) || /^DJYP/.test(model)
}

/**
 * 【死规则】判断型号是否应跳过对屏计算
 * A类（无对屏，仅总屏）跳过：
 *   DJYVRP / DJYVPR / DJYVVPR 及其子类（如 DJYJPYPR / DJYJPVPR）
 */
export function shouldSkipPairShield(model: string): boolean {
  return /^DJYJPYPR/.test(model)
    || /^DJYJPVPR/.test(model)
    || /^DJYVVPR/.test(model)
    || /^DJYVPR/.test(model)
    || /^DJYVRP/.test(model)
}

/**
 * 判断型号的总屏是否使用铜带（P2型）
 */
export function isOverallTapeShield(model: string): boolean {
  return /P2/.test(model) || /^DJYPVP2/.test(model) || /^DJYP2VP2/.test(model)
}

/**
 * 判断型号的对屏是否使用铜带（DJYP2VP2型）
 * DJYP2VP2的对屏是铜塑复合带，不是编织屏蔽
 */
export function isPairTapeShield(model: string): boolean {
  return /^DJYP2VP2/.test(model)
}

/**
 * 【死规则】判断型号是否应跳过接地线计算
 * 
 * 用户明确给出的死规则清单（9个型号）都无接地线：
 *   A类（无对屏，仅总屏）：DJYVRP / DJYVPR / DJYVVPR
 *   B类（有对屏+总屏）：DJYVP / DJYPVP / DJYJPYP / DJYPVRP / DJVPVP / DJVPVPR
 *   RS485：只需主导体+总屏蔽，不含接地线
 * 
 * 注意：DJYP2VP2 不在清单内，仍然保留接地线计算（其有 copperTape + groundWire 结构）
 * 
 * 这些型号都不应使用DJYPVP表里的接地线参数(groundWire1/groundWire2)参与计算
 */
export function shouldSkipGroundWire(model: string): boolean {
  return /^RS485/.test(model)
    // A类（无对屏，仅总屏）
    || /^DJYJPYPR/.test(model)
    || /^DJYJPVPR/.test(model)
    || /^DJYVVPR/.test(model)
    || /^DJYVPR/.test(model)
    || /^DJYVRP/.test(model)
    // B类（有对屏+总屏）
    || /^DJYJPYP/.test(model)
    || /^DJYJPVP/.test(model)
    || /^DJYPVRP/.test(model)
    || /^DJVPVPR/.test(model)
    || /^DJVPVP/.test(model)
    || /^DJYVVP/.test(model)
    || /^DJYVP/.test(model)   // DJYVP（注意：要放在 DJYVVP 之后避免被它截断）
    || /^DJYPVP/.test(model)
}
