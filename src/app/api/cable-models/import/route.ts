import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/cable-models/import — 从Excel导入电缆参数
 * 
 * 支持多种Excel格式自动识别：
 * 1. KVVP格式：多列（导体直径/芯数/铜比重/绕包外径/丝材直径/铜带重量等）
 * 2. BVR简单格式：少列（只有型号/规格/导体数/单丝根数/单丝直径等）
 * 3. YJV格式：有主导体+中性导体（导体芯数/根数/丝径 + 中性导体芯数/根数/丝径）
 */

type ExcelFormat = 'kvvp' | 'simple' | 'yjv' | 'unknown'

interface ColMap {
  model?: number
  spec?: number
  // 主导体参数
  conductorCoreCount?: number   // 导体芯数 (YJV/BVR: D列)
  wireCount?: number            // 单丝根数 (YJV/BVR: E列)
  conductorDiameter?: number    // 单丝直径 (YJV/BVR: F列)
  conductorWeight?: number      // 主导体重量列
  // KVVP专用
  copperDensity?: number        // 铜比重
  wrapDiameter?: number         // 绕包后外径
  wireDiameter?: number         // 丝材直径(屏蔽)
  copperTapeWeightPerKm?: number // 铜带重量
  // 中性导体参数 (YJV)
  neutralCoreCount?: number     // 中性导体芯数 (H列)
  neutralWireCount?: number     // 中性单丝根数 (I列)
  neutralWireDiameter?: number  // 中性单丝直径 (J列)
  neutralWeight?: number        // 中性导体重量列
  // 辅助
  lengthCol?: number            // 长度/数量列
}

function detectFormatAndMap(rows: any[][]): { format: ExcelFormat; colMap: ColMap } {
  const row1 = (rows[0] || []) as string[]
  const row2 = (rows[1] || []) as string[]
  
  const colMap: ColMap = {}
  
  // === 第1步：先用第一行建立区域映射 ===
  // YJV Excel: 第一行"主导体"跨越D1:F1，"中性导体"跨越H1:J1
  // 我们需要知道哪些列属于"主导体"区域，哪些属于"中性导体"区域
  const mainConductorCols = new Set<number>()
  const neutralConductorCols = new Set<number>()
  let currentRegion: 'main' | 'neutral' | null = null
  for (let i = 0; i < row1.length; i++) {
    const h = String(row1[i] || '').trim()
    if (h === '主导体') { currentRegion = 'main'; mainConductorCols.add(i) }
    else if (h === '中性导体') { currentRegion = 'neutral'; neutralConductorCols.add(i) }
    else if (h) { currentRegion = null }  // 其他标题重置区域
    else if (currentRegion === 'main') { mainConductorCols.add(i) }
    else if (currentRegion === 'neutral') { neutralConductorCols.add(i) }
  }
  
  // === 第2步：解析第二行（具体列名），结合区域信息 ===
  for (let i = 0; i < row2.length; i++) {
    const h = String(row2[i] || '').trim()
    const isNeutralRegion = neutralConductorCols.has(i)
    
    if (h === '型号') colMap.model = i
    else if (h === '规格') colMap.spec = i
    else if (h === '数量') colMap.lengthCol = i
    // 主导体区域的关键词
    else if (!isNeutralRegion && (h.includes('导体直径') && !h.includes('单丝'))) colMap.conductorDiameter = i
    else if (!isNeutralRegion && (h.includes('导体芯数') || h === '芯数')) colMap.conductorCoreCount = i
    else if (!isNeutralRegion && (h.includes('导体根数') || h === '根数')) colMap.wireCount = i
    else if (!isNeutralRegion && h.includes('单丝直径')) colMap.conductorDiameter = i
    else if (!isNeutralRegion && h.includes('铜比重')) colMap.copperDensity = i
    else if (!isNeutralRegion && (h.includes('绕包后外径') || h.includes('绕包外径'))) colMap.wrapDiameter = i
    else if (!isNeutralRegion && h.includes('丝材直径')) colMap.wireDiameter = i
    else if (!isNeutralRegion && h.includes('铜带重量')) colMap.copperTapeWeightPerKm = i
    else if (!isNeutralRegion && h === '重量') {
      if (colMap.conductorWeight === undefined) colMap.conductorWeight = i
    }
    // 中性导体区域的关键词
    else if (isNeutralRegion && (h.includes('导体芯数') || h === '芯数')) colMap.neutralCoreCount = i
    else if (isNeutralRegion && (h.includes('导体根数') || h === '根数' || h.includes('单丝根数'))) colMap.neutralWireCount = i
    else if (isNeutralRegion && h.includes('单丝直径')) colMap.neutralWireDiameter = i
    else if (isNeutralRegion && h === '重量') colMap.neutralWeight = i
  }
  
  // 第一行补充
  for (let i = 0; i < row1.length; i++) {
    const h = String(row1[i] || '').trim()
    if (h === '型号' && colMap.model === undefined) colMap.model = i
    else if (h === '规格' && colMap.spec === undefined) colMap.spec = i
  }
  
  // === 第2步：判断格式类型 ===
  const totalCols = Math.max(row1.length, row2.length)
  
  // KVVP格式：有"导体直径"（不是单丝直径）和屏蔽相关列
  const hasKVVPKeywords = row2.some((h: string) => String(h || '').includes('导体直径'))
    && (colMap.wrapDiameter !== undefined || colMap.wireDiameter !== undefined)
  
  // YJV格式：有"导体芯数"+"导体根数"+"单丝直径" 和 "中性导体"表头
  const hasYJVKeywords = colMap.conductorCoreCount !== undefined
    && colMap.wireCount !== undefined
    && (colMap.neutralCoreCount !== undefined || row1.some((h: string) => String(h || '').includes('中性导体')))
  
  if (hasKVVPKeywords) {
    return { format: 'kvvp', colMap }
  }
  
  if (hasYJVKeywords || colMap.neutralCoreCount !== undefined || colMap.neutralWeight !== undefined) {
    // YJV格式：补充缺失的列映射（通过位置推断）
    if (!colMap.model) colMap.model = 0
    if (!colMap.spec) colMap.spec = 1
    if (colMap.conductorCoreCount === undefined) colMap.conductorCoreCount = 3
    if (colMap.wireCount === undefined) colMap.wireCount = 4
    if (colMap.conductorDiameter === undefined) colMap.conductorDiameter = 5
    if (colMap.conductorWeight === undefined || colMap.conductorWeight === -1) colMap.conductorWeight = 6
    if (colMap.neutralCoreCount === undefined) colMap.neutralCoreCount = 7
    if (colMap.neutralWireCount === undefined) colMap.neutralWireCount = 8
    if (colMap.neutralWireDiameter === undefined) colMap.neutralWireDiameter = 9
    if (colMap.neutralWeight === undefined || colMap.neutralWeight === -1) colMap.neutralWeight = 10
    return { format: 'yjv', colMap }
  }
  
  // === 简单格式（BVR等）- 通过数据行推断 ===
  const noShieldCols = colMap.wrapDiameter === undefined 
    && colMap.wireDiameter === undefined 
    && colMap.copperTapeWeightPerKm === undefined
  
  if (noShieldCols) {
    const dataRows = rows.slice(2).filter((r: any[]) => r && r.length > 0 && r[1]) as any[][]
    
    if (dataRows.length > 0) {
      const sampleRow = dataRows[0]
      
      if (!colMap.model) colMap.model = 0
      if (!colMap.spec) colMap.spec = 1
      
      // 检查是否是YJV格式（有中性导体列，列数>7）
      if (sampleRow.length > 7) {
        // 检查H/I/J列是否有中性导体数据
        const hasNeutralData = dataRows.some(r => r[7] !== null && r[7] !== undefined && r[7] !== '')
        if (hasNeutralData) {
          colMap.conductorCoreCount = 3
          colMap.wireCount = 4
          colMap.conductorDiameter = 5
          colMap.conductorWeight = 6
          colMap.neutralCoreCount = 7
          colMap.neutralWireCount = 8
          colMap.neutralWireDiameter = 9
          colMap.neutralWeight = 10
          return { format: 'yjv', colMap }
        }
      }
      
      // BVR格式推断
      for (let i = 2; i < sampleRow.length; i++) {
        if (i === colMap.model || i === colMap.spec || i === colMap.conductorWeight || i === colMap.lengthCol) continue
        
        const val = sampleRow[i]
        if (val === null || val === undefined) continue
        const numVal = typeof val === 'number' ? val : parseFloat(String(val))
        if (isNaN(numVal)) continue
        
        if ((numVal === 1 || numVal === 2) && colMap.conductorCoreCount === undefined) {
          const allSmall = dataRows.slice(0, 5).every(r => r[i] === 1 || r[i] === 2)
          if (allSmall) { colMap.conductorCoreCount = i; continue }
        }
        if (numVal >= 0.1 && numVal <= 3.0 && colMap.conductorDiameter === undefined) {
          colMap.conductorDiameter = i; continue
        }
        if (numVal >= 10 && colMap.wireCount === undefined) {
          colMap.wireCount = i; continue
        }
      }
      
      if (colMap.wireCount !== undefined && colMap.conductorDiameter !== undefined) {
        return { format: 'simple', colMap }
      }
    }
    
    // 默认BVR位置
    if (!colMap.model) colMap.model = 0
    if (!colMap.spec) colMap.spec = 1
    if (colMap.conductorCoreCount === undefined) colMap.conductorCoreCount = 3
    if (colMap.wireCount === undefined) colMap.wireCount = 4
    if (colMap.conductorDiameter === undefined) colMap.conductorDiameter = 5
    return { format: 'simple', colMap }
  }
  
  // KVVP默认位置
  if (totalCols >= 10) {
    colMap.model = colMap.model || 0
    colMap.spec = colMap.spec || 1
    colMap.conductorDiameter = colMap.conductorDiameter || 3
    colMap.conductorCoreCount = colMap.conductorCoreCount || 4
    colMap.copperDensity = colMap.copperDensity || 5
    colMap.wrapDiameter = colMap.wrapDiameter || 7
    colMap.wireDiameter = colMap.wireDiameter || 8
    colMap.copperTapeWeightPerKm = colMap.copperTapeWeightPerKm || 10
    return { format: 'kvvp', colMap }
  }
  
  return { format: 'unknown', colMap }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const modelId = formData.get('modelId') as string | null
    const modelName = formData.get('modelName') as string | null
    const displayName = formData.get('displayName') as string | null
    const category = formData.get('category') as string | null

    if (!file) {
      return NextResponse.json({ error: '请上传Excel文件' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (rows.length < 3) {
      return NextResponse.json({ error: 'Excel数据不足' }, { status: 400 })
    }

    const { format, colMap } = detectFormatAndMap(rows)
    
    if (format === 'unknown') {
      return NextResponse.json({ error: '无法识别Excel格式' }, { status: 400 })
    }

    // 获取或创建型号
    let targetModelId = modelId

    if (!targetModelId && modelName) {
      const hasBraidShield = format === 'kvvp' && colMap.wireDiameter !== undefined
      const hasCopperTape = format === 'kvvp' && colMap.copperTapeWeightPerKm !== undefined
      const hasNeutralConductor = format === 'yjv'
      
      let defaultCategory = '控制电缆'
      if (format === 'simple') defaultCategory = '布电线'
      if (format === 'yjv') defaultCategory = '电力电缆'
      
      const newModel = await db.cableModel.create({
        data: {
          name: modelName,
          displayName: displayName || modelName,
          category: category || defaultCategory,
          hasConductor: true,
          hasNeutralConductor,
          hasBraidShield,
          hasCopperTape,
          defaultShieldType: hasBraidShield ? 'braid' : (hasCopperTape ? 'tape' : 'none'),
        },
      })
      targetModelId = newModel.id
    }

    if (!targetModelId) {
      return NextResponse.json({ error: '请指定型号ID或提供新型号名称' }, { status: 400 })
    }

    // 解析数据行
    const dataStartRow = 2
    const specs = []
    const errors = []

    for (let i = dataStartRow; i < rows.length; i++) {
      const row = rows[i] as any[]
      if (!row || row.length === 0) continue

      let specVal = colMap.spec !== undefined ? String(row[colMap.spec] || '').trim() : ''
      if (!specVal) continue

      if (format === 'yjv') {
        // === YJV格式解析 ===
        const mainCoreCount = colMap.conductorCoreCount !== undefined ? parseInt(row[colMap.conductorCoreCount]) || 0 : 0
        const mainWireCount = colMap.wireCount !== undefined ? parseInt(row[colMap.wireCount]) || 0 : 0
        const mainWireDiam = colMap.conductorDiameter !== undefined ? parseFloat(row[colMap.conductorDiameter]) || 0 : 0
        
        if (!mainCoreCount || !mainWireCount || !mainWireDiam) {
          errors.push(`行${i + 1}: 主导体参数不全(${mainCoreCount}/${mainWireCount}/${mainWireDiam})，跳过`)
          continue
        }

        // 中性导体参数（可能为空，如1芯/2芯/3芯/5芯没有中性线）
        const neutralCores = colMap.neutralCoreCount !== undefined ? parseInt(row[colMap.neutralCoreCount]) || 0 : 0
        const neutralWires = colMap.neutralWireCount !== undefined ? parseInt(row[colMap.neutralWireCount]) || 0 : 0
        const neutralDiam = colMap.neutralWireDiameter !== undefined ? parseFloat(row[colMap.neutralWireDiameter]) || 0 : 0

        specs.push({
          modelId: targetModelId!,
          spec: specVal,
          conductorDiameter: mainWireDiam,
          coreCount: mainWireCount * mainCoreCount,  // 等效芯数 = 单丝根数 × 导体芯数
          copperDensity: 8.9,
          wrapDiameter: 0,
          wireDiameter: 0,
          copperTapeWeightPerKm: 0,
          neutralCoreCount: neutralCores,
          neutralWireCount: neutralWires,
          neutralWireDiameter: neutralDiam,
        })
      } else if (format === 'simple') {
        // === BVR简单格式解析 ===
        const conductorCount = colMap.conductorCoreCount !== undefined ? parseInt(row[colMap.conductorCoreCount]) || 1 : 1
        const wireCount = colMap.wireCount !== undefined ? parseInt(row[colMap.wireCount]) || 0 : 0
        const wireDiam = colMap.conductorDiameter !== undefined ? parseFloat(row[colMap.conductorDiameter]) || 0 : 0
        
        if (!wireCount || !wireDiam) {
          errors.push(`行${i + 1}: 根数或丝径为0，跳过`)
          continue
        }

        specs.push({
          modelId: targetModelId!,
          spec: specVal,
          conductorDiameter: wireDiam,
          coreCount: wireCount * conductorCount,
          copperDensity: 8.9,
          wrapDiameter: 0,
          wireDiameter: 0,
          copperTapeWeightPerKm: 0,
          neutralCoreCount: 0,
          neutralWireCount: 0,
          neutralWireDiameter: 0,
        })
      } else {
        // === KVVP格式解析 ===
        const conductorDiameter = colMap.conductorDiameter !== undefined ? parseFloat(row[colMap.conductorDiameter]) || 0 : 0
        const coreCount = colMap.conductorCoreCount !== undefined ? parseInt(row[colMap.conductorCoreCount]) || 0 : 0

        if (!coreCount || !conductorDiameter) {
          errors.push(`行${i + 1}: 芯数或导体直径为0，跳过`)
          continue
        }

        specs.push({
          modelId: targetModelId!,
          spec: specVal,
          conductorDiameter,
          coreCount,
          copperDensity: colMap.copperDensity !== undefined ? parseFloat(row[colMap.copperDensity]) || 8.9 : 8.9,
          wrapDiameter: colMap.wrapDiameter !== undefined ? parseFloat(row[colMap.wrapDiameter]) || 0 : 0,
          wireDiameter: colMap.wireDiameter !== undefined ? parseFloat(row[colMap.wireDiameter]) || 0 : 0,
          copperTapeWeightPerKm: colMap.copperTapeWeightPerKm !== undefined ? parseFloat(row[colMap.copperTapeWeightPerKm]) || 0 : 0,
          neutralCoreCount: 0,
          neutralWireCount: 0,
          neutralWireDiameter: 0,
        })
      }
    }

    if (specs.length === 0) {
      return NextResponse.json({ 
        error: '未解析到有效规格数据',
        hint: `格式: ${format}, 列映射: ${JSON.stringify(colMap)}, 错误: ${errors.slice(0, 5).join('; ')}`,
      }, { status: 400 })
    }

    // 批量写入
    let upserted = 0
    for (const s of specs) {
      await db.cableSpec.upsert({
        where: { modelId_spec: { modelId: s.modelId, spec: s.spec } },
        update: {
          conductorDiameter: s.conductorDiameter,
          coreCount: s.coreCount,
          copperDensity: s.copperDensity,
          wrapDiameter: s.wrapDiameter,
          wireDiameter: s.wireDiameter,
          copperTapeWeightPerKm: s.copperTapeWeightPerKm,
          neutralCoreCount: s.neutralCoreCount,
          neutralWireCount: s.neutralWireCount,
          neutralWireDiameter: s.neutralWireDiameter,
        },
        create: s,
      })
      upserted++
    }

    return NextResponse.json({
      success: true,
      imported: upserted,
      format,
      colMap,
      errors: errors.slice(0, 10),
      totalRows: rows.length - dataStartRow,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
