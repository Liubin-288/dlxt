import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/cable-models/specs?modelId=xxx — 获取某型号的规格列表
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const modelId = searchParams.get('modelId')
    const spec = searchParams.get('spec')

    if (spec && modelId) {
      const found = await db.cableSpec.findUnique({
        where: { modelId_spec: { modelId, spec } },
      })
      return NextResponse.json({ spec: found })
    }

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

// POST /api/cable-models/specs — 添加规格（单条或批量）
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // 批量添加
    if (body.specs && Array.isArray(body.specs)) {
      const results = []
      for (const s of body.specs) {
        const spec = await db.cableSpec.upsert({
          where: { modelId_spec: { modelId: s.modelId, spec: s.spec } },
          update: {
            conductorDiameter: s.conductorDiameter,
            coreCount: s.coreCount,
            copperDensity: s.copperDensity ?? 8.9,
            wrapDiameter: s.wrapDiameter ?? 0,
            wireDiameter: s.wireDiameter ?? 0,
            copperTapeWeightPerKm: s.copperTapeWeightPerKm ?? 0,
            neutralCoreCount: s.neutralCoreCount ?? 0,
            neutralWireCount: s.neutralWireCount ?? 0,
            neutralWireDiameter: s.neutralWireDiameter ?? 0,
            pairCount: s.pairCount ?? 0,
            coresPerPair: s.coresPerPair ?? 0,
            pairWrapDiameter: s.pairWrapDiameter ?? 0,
            pairWireDiameter: s.pairWireDiameter ?? 0,
            groundWireWeightPerKm: s.groundWireWeightPerKm ?? 0,
            tapeShieldWeightPerKm: s.tapeShieldWeightPerKm ?? 0,
          },
          create: {
            modelId: s.modelId,
            spec: s.spec,
            conductorDiameter: s.conductorDiameter,
            coreCount: s.coreCount,
            copperDensity: s.copperDensity ?? 8.9,
            wrapDiameter: s.wrapDiameter ?? 0,
            wireDiameter: s.wireDiameter ?? 0,
            copperTapeWeightPerKm: s.copperTapeWeightPerKm ?? 0,
            neutralCoreCount: s.neutralCoreCount ?? 0,
            neutralWireCount: s.neutralWireCount ?? 0,
            neutralWireDiameter: s.neutralWireDiameter ?? 0,
            pairCount: s.pairCount ?? 0,
            coresPerPair: s.coresPerPair ?? 0,
            pairWrapDiameter: s.pairWrapDiameter ?? 0,
            pairWireDiameter: s.pairWireDiameter ?? 0,
            groundWireWeightPerKm: s.groundWireWeightPerKm ?? 0,
            tapeShieldWeightPerKm: s.tapeShieldWeightPerKm ?? 0,
          },
        })
        results.push(spec)
      }
      return NextResponse.json({ specs: results, count: results.length })
    }

    // 单条添加
    const { modelId, spec, conductorDiameter, coreCount, copperDensity, wrapDiameter, wireDiameter, copperTapeWeightPerKm } = body
    if (!modelId || !spec || !conductorDiameter || !coreCount) {
      return NextResponse.json({ error: '缺少必要参数: modelId, spec, conductorDiameter, coreCount' }, { status: 400 })
    }

    const { neutralCoreCount, neutralWireCount, neutralWireDiameter } = body
    const created = await db.cableSpec.upsert({
      where: { modelId_spec: { modelId, spec } },
      update: {
        conductorDiameter,
        coreCount,
        copperDensity: copperDensity ?? 8.9,
        wrapDiameter: wrapDiameter ?? 0,
        wireDiameter: wireDiameter ?? 0,
        copperTapeWeightPerKm: copperTapeWeightPerKm ?? 0,
        neutralCoreCount: neutralCoreCount ?? 0,
        neutralWireCount: neutralWireCount ?? 0,
        neutralWireDiameter: neutralWireDiameter ?? 0,
      },
      create: {
        modelId, spec, conductorDiameter, coreCount,
        copperDensity: copperDensity ?? 8.9,
        wrapDiameter: wrapDiameter ?? 0,
        wireDiameter: wireDiameter ?? 0,
        copperTapeWeightPerKm: copperTapeWeightPerKm ?? 0,
        neutralCoreCount: neutralCoreCount ?? 0,
        neutralWireCount: neutralWireCount ?? 0,
        neutralWireDiameter: neutralWireDiameter ?? 0,
      },
    })

    return NextResponse.json({ spec: created })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: '该规格已存在' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/cable-models/specs?id=xxx
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await db.cableSpec.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
