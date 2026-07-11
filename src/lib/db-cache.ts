/**
 * 内存缓存数据库访问层
 * - 启动时从 SQLite 读取所有数据到内存
 * - 读操作全部走内存缓存，不访问数据库
 * - 写操作通过序列化队列执行，避免并发冲突
 */
import { PrismaClient } from '@prisma/client'

// 内存缓存
let _modelsCache: any[] | null = null
let _specsCache: any[] | null = null
let _allModelsSpecsCache: { model: any; specs: any[] }[] | null = null
let _initPromise: Promise<void> | null = null  // 初始化互斥锁

// 单例 PrismaClient
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// 写操作序列化队列
let _writeQueue: Promise<any> = Promise.resolve()

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = _writeQueue.then(fn).catch(err => {
    console.error('Write queue error:', err)
    throw err
  })
  _writeQueue = task.then(() => {}, () => {})  // 确保队列继续
  return task
}

// 预加载所有数据到内存
async function preloadData() {
  if (_modelsCache) return

  const models = await prisma.cableModel.findMany({
    include: { _count: { select: { specs: true } } },
    orderBy: { createdAt: 'asc' },
  })
  
  const specs = await prisma.cableSpec.findMany({
    include: { model: true },
    orderBy: [{ coreCount: 'asc' }, { spec: 'asc' }],
  })

  _modelsCache = models
  _specsCache = specs

  // 按 model 分组
  _allModelsSpecsCache = models.map(m => ({
    model: m,
    specs: specs.filter(s => s.modelId === m.id),
  }))
}

// 确保数据已加载（带互斥锁）
async function ensureLoaded() {
  if (_modelsCache) return
  if (_initPromise) { await _initPromise; return }
  
  _initPromise = preloadData().catch(e => {
    _initPromise = null
    throw e
  })
  await _initPromise
}

// 刷新缓存（写入操作后调用）
async function refreshCache() {
  _modelsCache = null
  _specsCache = null
  _allModelsSpecsCache = null
  await preloadData()
}

// === 读操作（全部走内存缓存） ===

export async function getAllModels() {
  await ensureLoaded()
  return _modelsCache!
}

export async function getModelById(modelId: string) {
  await ensureLoaded()
  return _modelsCache!.find(m => m.id === modelId)
}

export async function getSpecsByModelId(modelId: string) {
  await ensureLoaded()
  return _specsCache!.filter(s => s.modelId === modelId)
}

export async function getAllSpecsWithModel() {
  await ensureLoaded()
  return _specsCache!
}

export async function getAllModelsSpecs() {
  await ensureLoaded()
  return _allModelsSpecsCache!
}

export async function findSpecByModelAndSpec(modelId: string, spec: string) {
  await ensureLoaded()
  return _specsCache!.find(s => s.modelId === modelId && s.spec === spec) || null
}

// === 写操作（序列化执行） ===

export async function deleteModel(modelId: string) {
  return enqueueWrite(async () => {
    await prisma.cableSpec.deleteMany({ where: { modelId } })
    await prisma.cableModel.delete({ where: { id: modelId } })
    await refreshCache()
  })
}

export async function createModel(data: any) {
  return enqueueWrite(async () => {
    const model = await prisma.cableModel.create({ data })
    await refreshCache()
    return model
  })
}

export async function createSpec(data: any) {
  return enqueueWrite(async () => {
    const spec = await prisma.cableSpec.create({ data })
    await refreshCache()
    return spec
  })
}

export async function upsertSpecs(specs: any[]) {
  return enqueueWrite(async () => {
    const results = []
    for (const s of specs) {
      const spec = await prisma.cableSpec.upsert({
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
          groundWire1Diameter: s.groundWire1Diameter ?? 0,
          groundWire1Count: s.groundWire1Count ?? 0,
          groundWire2Diameter: s.groundWire2Diameter ?? 0,
          groundWire2Count: s.groundWire2Count ?? 0,
          groundWireWeightPerKm: s.groundWireWeightPerKm ?? 0,
          tapeShieldWeightPerKm: s.tapeShieldWeightPerKm ?? 0,
        },
        create: s,
      })
      results.push(spec)
    }
    await refreshCache()
    return results.length
  })
}

export async function deleteSpec(id: string) {
  return enqueueWrite(async () => {
    await prisma.cableSpec.delete({ where: { id } })
    await refreshCache()
  })
}
