import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  calcConductorWeight,
  calcBraidShieldWeight,
  calcCopperTapeWeight,
  calcGroundWireWeight,
  parseMaterialInfo,
  getShieldType,
  resolveModelAlias,
  resolveModelDisplayName,
  getBraidCoverageFactor,
  findSpecFuzzy,
  shouldSkipPairShield,
  shouldSkipGroundWire,
  hasCopperTape,
  normalizeSpecStr,
  parseNeutralFromSpec,
  getNeutralWireInfo,
} from '@/lib/copper-calculator'

// GET /api/copper?modelId=xxx — 获取某型号所有规格
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const modelId = searchParams.get('modelId')

    const where = modelId ? { modelId } : {}
    const specs = await db.cableSpec.findMany({
      where,
      orderBy: [{ coreCount: 'asc' }, { spec: 'asc' }],
    })
    return NextResponse.json({ specs })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body.action === 'calculate') {
      const { cores, crossSection, lengthM, shieldType, modelId, neutralCores, neutralCrossSection, pairCount, coresPerPair } = body
      if (!cores || !crossSection || !lengthM) {
        return NextResponse.json({ error: '缺少必要参数: cores, crossSection, lengthM' }, { status: 400 })
      }

      const models = await db.cableModel.findMany()
      const targetModelId = modelId || models[0]?.id
      if (!targetModelId) {
        return NextResponse.json({ error: '数据库中无电缆型号' }, { status: 404 })
      }

      // 构建规格字符串（支持复合规格和对绞规格）
      let specStr: string
      if (pairCount && coresPerPair && pairCount >= 1) {
        // 对绞规格: pairCount>1 → "2*2*0.5", pairCount=1 → "2*0.5"（数据库1对规格不含对数前缀）
        if (pairCount > 1) {
          specStr = `${pairCount}*${coresPerPair}*${crossSection}`
        } else {
          specStr = `${coresPerPair}*${crossSection}`
        }
      } else if (neutralCores && neutralCrossSection) {
        specStr = `${cores}*${crossSection}+${neutralCores}*${neutralCrossSection}`
      } else {
        specStr = `${cores}*${crossSection}`
      }

      let spec = await db.cableSpec.findUnique({
        where: { modelId_spec: { modelId: targetModelId, spec: specStr } },
        include: { model: true },
      })

      // 精确匹配失败时，模糊匹配
      if (!spec) {
        const allSpecs = await db.cableSpec.findMany({ where: { modelId: targetModelId }, include: { model: true } })
        spec = findSpecFuzzy(allSpecs as any, specStr) as any
      }

      if (!spec) {
        return NextResponse.json({ error: `未找到匹配规格: ${specStr}` }, { status: 404 })
      }

      const st = shieldType || getShieldType(spec.model.name)
      const result = calcFullResult(spec, lengthM, st, spec.model.name)
      return NextResponse.json({ result })
    }

    if (body.action === 'batch') {
      const { items, modelId, conductorType } = body
      if (!items || !Array.isArray(items)) {
        return NextResponse.json({ error: '缺少 items 数组' }, { status: 400 })
      }

      // 优化：只加载型号列表（不含specs），按需加载specs
      const models = await db.cableModel.findMany()
      // 缓存已加载的型号specs，避免重复查询
      const modelSpecsCache: Record<string, any[]> = {}

      const results = []
      let totalConductorWeight = 0
      let totalCopperWeight = 0
      let totalBraidShieldWeight = 0
      let totalCopperTapeWeight = 0
      let totalPairShieldWeight = 0
      let totalGroundWireWeight = 0

      for (const item of items) {
        const parsed = parseMaterialInfo(item.materialInfo)
        if (!parsed) {
          results.push({ materialInfo: item.materialInfo, lengthM: item.lengthM, error: '无法解析物料信息' })
          continue
        }

        // 构建规格字符串
        let specStr: string
        if (parsed.pairCount && parsed.coresPerPair && parsed.pairCount >= 1) {
          // 对绞规格: pairCount>1 → "2*2*0.5", pairCount=1 → "2*0.5"
          if (parsed.pairCount > 1) {
            specStr = `${parsed.pairCount}*${parsed.coresPerPair}*${parsed.crossSection}`
          } else {
            specStr = `${parsed.coresPerPair}*${parsed.crossSection}`
          }
        } else if (parsed.neutralCores && parsed.neutralCrossSection) {
          specStr = `${parsed.cores}*${parsed.crossSection}+${parsed.neutralCores}*${parsed.neutralCrossSection}`
        } else if (parsed.specStr) {
          specStr = normalizeSpecStr(parsed.specStr)
        } else {
          specStr = `${parsed.cores}*${parsed.crossSection}`
        }

        let spec = null
        let matchedModel = null

        // 辅助函数：按需加载某型号的specs
        async function loadModelSpecs(m: any): Promise<any[]> {
          if (!modelSpecsCache[m.id]) {
            modelSpecsCache[m.id] = await db.cableSpec.findMany({ where: { modelId: m.id }, include: { model: true } })
          }
          return modelSpecsCache[m.id]
        }

        // 判断物料信息中的型号是否解析到了与UI不同的数据库型号
        // 例如：用户UI选了DJYPVP，但物料信息写的是DJYP2VP2R→应使用DJYP2VP2数据
        let parsedModelResolved: string | null = null
        let parsedModelMatch: any = null  // 匹配到的数据库model记录
        if (parsed.model) {
          const aliasName = resolveModelAlias(parsed.model)
          const aliasClean = aliasName.replace(/[-]/g, '').replace(/22$/, '')
          // 在所有型号中查找与解析型号匹配的
          for (const m of models) {
            const dbName = m.name.replace(/[-]/g, '').replace(/22$/, '')
            if (dbName === aliasClean || m.name === aliasName || dbName === parsed.model.replace(/[-]/g, '').replace(/22$/, '') || m.name === parsed.model) {
              parsedModelResolved = m.name
              parsedModelMatch = m
              break
            }
          }
          // 如果没有精确匹配，尝试includes匹配
          if (!parsedModelMatch) {
            for (const m of models) {
              const dbName = m.name.replace(/[-]/g, '').replace(/22$/, '')
              if (aliasClean.includes(dbName) || dbName.includes(aliasClean)) {
                parsedModelResolved = m.name
                parsedModelMatch = m
                break
              }
            }
          }
        }

        // 检查UI选中的modelId对应的型号是否与物料信息解析出的型号一致
        const uiModel = modelId ? models.find(m => m.id === modelId) : null
        const modelMismatch = parsedModelResolved && uiModel && parsedModelResolved !== uiModel.name

        // 策略1（最高优先级）: 物料信息中的型号解析到了与UI不同的数据库型号时，
        // 优先使用物料信息解析出的型号（如DJYP2VP2R→DJYP2VP2，不用UI选的DJYPVP）
        if (modelMismatch && parsedModelMatch) {
          const specs = await loadModelSpecs(parsedModelMatch)
          const found = findSpecFuzzy(specs as any, specStr)
          if (found) {
            spec = found
            matchedModel = parsedModelMatch
          }
        }

        // 策略2: 按物料信息中的型号名匹配（含别名映射）
        if (!spec && parsed.model) {
          const searchName = parsed.model.replace(/[-]/g, '').replace(/22$/, '')
          let aliasName = resolveModelAlias(parsed.model).replace(/[-]/g, '').replace(/22$/, '')
          
          // 导体类型B类：DJYPVP系列优先查找DJYPVP-B
          let preferredModelName: string | null = null
          if (conductorType === 'B' && /^DJYPVP/.test(aliasName)) {
            preferredModelName = 'DJYPVP-B'
          }
          
          // 优先匹配preferredModel
          if (preferredModelName) {
            const preferredModel = models.find(m => m.name === preferredModelName)
            if (preferredModel) {
              const specs = await loadModelSpecs(preferredModel)
              const found = findSpecFuzzy(specs as any, specStr)
              if (found) {
                spec = found
                matchedModel = preferredModel
              }
            }
          }
          
          if (!spec) {
            for (const m of models) {
              const dbName = m.name.replace(/[-]/g, '').replace(/22$/, '')
              if (dbName === searchName || dbName === aliasName || m.name === parsed.model || m.name === resolveModelAlias(parsed.model) || dbName.includes(searchName) || searchName.includes(dbName) || dbName.includes(aliasName) || aliasName.includes(dbName)) {
                const specs = await loadModelSpecs(m)
                const found = findSpecFuzzy(specs as any, specStr)
                if (found) {
                  spec = found
                  matchedModel = m
                  break
                }
              }
            }
          }
        }

        // 策略3: 用UI指定的modelId查找（含模糊匹配）——降为较低优先级
        if (!spec && modelId) {
          const found = await db.cableSpec.findUnique({
            where: { modelId_spec: { modelId, spec: specStr } },
            include: { model: true },
          })
          if (found) {
            spec = found
            matchedModel = found.model
          }
          if (!spec) {
            if (!modelSpecsCache[modelId]) {
              modelSpecsCache[modelId] = await db.cableSpec.findMany({ where: { modelId }, include: { model: true } })
            }
            const fuzzySpec = findSpecFuzzy(modelSpecsCache[modelId] as any, specStr)
            if (fuzzySpec) {
              spec = fuzzySpec
              matchedModel = (fuzzySpec as any).model
            }
          }
        }

        // 策略4: 遍历所有型号（按需加载specs）
        if (!spec) {
          for (const m of models) {
            if (!modelSpecsCache[m.id]) {
              modelSpecsCache[m.id] = await db.cableSpec.findMany({ where: { modelId: m.id }, include: { model: true } })
            }
            const found = findSpecFuzzy(modelSpecsCache[m.id] as any, specStr)
            if (found) {
              spec = found
              matchedModel = m
              break
            }
          }
        }

        if (!spec || !matchedModel) {
          results.push({
            materialInfo: item.materialInfo,
            lengthM: item.lengthM,
            parsed,
            error: `未找到匹配规格: ${specStr}`,
          })
          continue
        }

        // 根据解析出的型号名智能判断屏蔽类型
        let shieldType: string
        if (item.shieldType) {
          shieldType = item.shieldType
        } else if (parsed.model) {
          shieldType = getShieldType(parsed.model)
        } else {
          shieldType = matchedModel.defaultShieldType
        }
        const result = calcFullResult(spec, item.lengthM, shieldType, parsed.model || matchedModel.name)
        
        // 标记实际使用的数据表型号（供前端显示）
        ;(result as any).matchedModelName = matchedModel.name
        
        // 标记是否使用了别名映射
        const resolvedAlias = parsed.model ? resolveModelAlias(parsed.model) : ''
        const displayName = parsed.model ? resolveModelDisplayName(parsed.model) : ''
        const usedAlias = resolvedAlias !== parsed.model && parsed.model
        if (usedAlias) {
          // DJYVPR: 显示 "DJYVPR→DJYVRP(套用DJYPVP)"
          // DJYP2VP2R: 显示 "DJYP2VP2R→DJYP2VP2"
          // 其他: 显示 "RVVP→KVVP"
          if (resolvedAlias !== matchedModel.name && displayName !== parsed.model) {
            (result as any).aliasNote = `${parsed.model}→${displayName}(套用${resolvedAlias})`
          } else {
            (result as any).aliasNote = `${parsed.model}→${matchedModel.name}`
          }
        }
        
        totalConductorWeight += result.conductorWeight + result.neutralConductorWeight
        totalCopperWeight += result.totalWeight
        totalBraidShieldWeight += result.braidShieldWeight
        totalCopperTapeWeight += result.copperTapeWeight
        totalPairShieldWeight += result.pairShieldWeight
        totalGroundWireWeight += result.groundWireWeight

        results.push({ materialInfo: item.materialInfo, lengthM: item.lengthM, parsed, result })
      }

      return NextResponse.json({
        results,
        summary: {
          totalItems: items.length,
          successItems: results.filter(r => r.result).length,
          totalConductorWeight: Math.round(totalConductorWeight * 100) / 100,
          totalCopperWeight: Math.round(totalCopperWeight * 100) / 100,
          totalBraidShieldWeight: Math.round(totalBraidShieldWeight * 100) / 100,
          totalCopperTapeWeight: Math.round(totalCopperTapeWeight * 100) / 100,
          totalPairShieldWeight: Math.round(totalPairShieldWeight * 100) / 100,
          totalGroundWireWeight: Math.round(totalGroundWireWeight * 100) / 100,
        },
      })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

function calcFullResult(spec: any, lengthM: number, shieldType: string, modelName?: string) {
  // 主导体重量
  const conductorWeight = calcConductorWeight(
    spec.conductorDiameter, spec.coreCount, spec.copperDensity || 8.9, lengthM
  )
  
  // 中性导体重量
  let neutralConductorWeight = 0
  if (spec.neutralWireCount && spec.neutralWireDiameter && spec.neutralCoreCount) {
    // 优先使用数据库中的中性参数
    const neutralEquivalent = spec.neutralWireCount * spec.neutralCoreCount
    neutralConductorWeight = calcConductorWeight(
      spec.neutralWireDiameter, neutralEquivalent, spec.copperDensity || 8.9, lengthM
    )
  } else if (spec.spec && spec.spec.includes('+')) {
    // 数据库中性参数为空，但规格为复合规格（如 "3*10+3*1.5"），自动从中性部分推算
    const neutralInfo = parseNeutralFromSpec(spec.spec)
    if (neutralInfo) {
      const wireInfo = getNeutralWireInfo(neutralInfo.neutralCrossSection)
      if (wireInfo) {
        const neutralEquivalent = wireInfo.wireCount * neutralInfo.neutralCoreCount
        neutralConductorWeight = calcConductorWeight(
          wireInfo.wireDiameter, neutralEquivalent, spec.copperDensity || 8.9, lengthM
        )
      }
    }
  }

  // 获取型号对应的编织覆盖系数K
  const coverageFactor = modelName ? getBraidCoverageFactor(modelName) : 0.5528

  // 对屏重量（DJYPVP等计算机电缆）
  // DJYVPR/DJYVRP：忽略对屏，只算总屏
  let pairShieldWeight = 0
  const skipPair = modelName && shouldSkipPairShield(modelName)
  if (!skipPair) {
    const isPairShieldCable = spec.pairCount > 0 || (spec.pairWrapDiameter > 0 && spec.pairWireDiameter > 0)
    if (isPairShieldCable && spec.pairWrapDiameter > 0 && spec.pairWireDiameter > 0) {
      // DJYP2VP2等型号：对屏使用铜带，pairWireDiameter存储的是每对铜带重量(kg/km)
      // 判断依据：pairWireDiameter > 1 → 铜带重量(kg/km)；<= 1 → 编织丝径(mm)
      const isPairTape = spec.pairWireDiameter > 1
      if (isPairTape) {
        // 铜带对屏：pairWireDiameter存的是每对铜带重量(kg/km)
        const singlePairWeight = spec.pairWireDiameter / 1000 * lengthM
        pairShieldWeight = singlePairWeight * (spec.pairCount || 1)
      } else {
        // 编织对屏：pairWireDiameter存的是丝径(mm)
        const singlePairWeight = calcBraidShieldWeight(spec.pairWireDiameter, spec.pairWrapDiameter, lengthM, coverageFactor)
        pairShieldWeight = singlePairWeight * (spec.pairCount || 1)
      }
    }
  }

  // 总屏编织屏蔽重量
  const braidShieldWeight = (shieldType === 'braid' || shieldType === 'both')
    ? calcBraidShieldWeight(spec.wireDiameter, spec.wrapDiameter, lengthM, coverageFactor) : 0

  // 总屏铜带重量
  // 【死规则】只有型号名包含 P2 才计算铜带重量，与 shieldType 无关
  // 例：DJYJPYP / DJYJPVP / DJYPVP / DJYVPR 等不含 P2 → 铜带 = 0
  //     DJYJPYP2 / DJYJPVP2 / DJYPVP2 / DJYP2VP2 / DJYP2VP2R 等含 P2 → 铜带正常计算
  let copperTapeWeight = 0
  if (hasCopperTape(modelName) && (shieldType === 'tape' || shieldType === 'both')) {
    if (spec.tapeShieldWeightPerKm && spec.tapeShieldWeightPerKm > 0) {
      copperTapeWeight = calcCopperTapeWeight(spec.tapeShieldWeightPerKm, lengthM)
    } else {
      copperTapeWeight = calcCopperTapeWeight(spec.copperTapeWeightPerKm, lengthM)
    }
  }

  // 接地线重量：RS485跳过（只需主导体+总屏蔽）
  let groundWireWeight = 0
  const skipGround = modelName && shouldSkipGroundWire(modelName)
  if (!skipGround) {
    // 接地线1（对屏区域的接地线）：始终用公式计算
    const density = spec.copperDensity || 8.9
    if (spec.groundWire1Diameter > 0 && spec.groundWire1Count > 0) {
      groundWireWeight += calcGroundWireWeight(spec.groundWire1Diameter, spec.groundWire1Count, density, lengthM)
    }
    // 接地线2（总屏区域的接地线）：优先用per-km重量，否则用公式计算
    if (spec.groundWireWeightPerKm && spec.groundWireWeightPerKm > 0) {
      groundWireWeight += spec.groundWireWeightPerKm / 1000 * lengthM
    } else if (spec.groundWire2Diameter > 0 && spec.groundWire2Count > 0) {
      groundWireWeight += calcGroundWireWeight(spec.groundWire2Diameter, spec.groundWire2Count, density, lengthM)
    }
  }

  const totalWeight = conductorWeight + neutralConductorWeight + pairShieldWeight + braidShieldWeight + copperTapeWeight + groundWireWeight

  return {
    spec: `${modelName || spec.model?.name || ''} ${spec.spec}`,
    lengthM,
    conductorWeight: Math.round(conductorWeight * 10000) / 10000,
    neutralConductorWeight: Math.round(neutralConductorWeight * 10000) / 10000,
    pairShieldWeight: Math.round(pairShieldWeight * 10000) / 10000,
    braidShieldWeight: Math.round(braidShieldWeight * 10000) / 10000,
    copperTapeWeight: Math.round(copperTapeWeight * 10000) / 10000,
    groundWireWeight: Math.round(groundWireWeight * 10000) / 10000,
    totalWeight: Math.round(totalWeight * 10000) / 10000,
    conductorDiameter: spec.conductorDiameter,
    coreCount: spec.coreCount,
    wrapDiameter: spec.wrapDiameter,
    wireDiameter: spec.wireDiameter,
    shieldType,
  }
}
