import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/cable-models — 获取所有型号列表（含规格数量）
export async function GET() {
  try {
    const models = await db.cableModel.findMany({
      include: {
        _count: { select: { specs: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ models })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

// POST /api/cable-models — 创建新型号
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, displayName, category, hasConductor, hasBraidShield, hasCopperTape, defaultShieldType, description } = body

    if (!name || !displayName) {
      return NextResponse.json({ error: '型号代码和显示名称为必填项' }, { status: 400 })
    }

    const model = await db.cableModel.create({
      data: {
        name,
        displayName,
        category: category || '控制电缆',
        hasConductor: hasConductor ?? true,
        hasBraidShield: hasBraidShield ?? true,
        hasCopperTape: hasCopperTape ?? true,
        defaultShieldType: defaultShieldType || 'braid',
        description,
      },
    })

    return NextResponse.json({ model })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: `型号代码 "${error.meta?.target?.[0]}" 已存在` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/cable-models — 删除型号
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
    }

    await db.cableSpec.deleteMany({ where: { modelId: id } })
    await db.cableModel.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
