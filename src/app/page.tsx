'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { toast, Toaster } from 'sonner'
import { ChevronDown, ChevronUp, Calculator, Upload, Settings2, Plus, Trash2, FileSpreadsheet } from 'lucide-react'
import cableDataJson from '@/lib/cable-data.json'
import {
  type CopperWeightResult,
  calcConductorWeight,
  calcBraidShieldWeight,
  calcCopperTapeWeight,
  calcTotalCopperWeight,
  parseMaterialInfo,
} from '@/lib/copper-calculator'
import type { CableSpec } from '@/lib/copper-calculator'

// === 类型 ===
interface CableModelDB {
  id: string
  name: string
  displayName: string
  category: string
  hasConductor: boolean
  hasNeutralConductor: boolean
  hasBraidShield: boolean
  hasCopperTape: boolean
  defaultShieldType: string
  description: string | null
  _count?: { specs: number }
}

interface CableSpecDB {
  id: string
  modelId: string
  spec: string
  conductorDiameter: number
  coreCount: number
  copperDensity: number
  wrapDiameter: number
  wireDiameter: number
  copperTapeWeightPerKm: number
  neutralCoreCount: number
  neutralWireCount: number
  neutralWireDiameter: number
  pairCount?: number
  coresPerPair?: number
  pairWrapDiameter?: number
  pairWireDiameter?: number
  groundWireWeightPerKm?: number
  tapeShieldWeightPerKm?: number
  model?: CableModelDB
}

interface BatchResultItem {
  materialInfo: string
  lengthM: number
  parsed?: { prefix: string; model: string; voltage: string; cores: number; crossSection: number; neutralCores?: number; neutralCrossSection?: number; specStr?: string }
  result?: CopperWeightResult
  error?: string
}

interface BatchSummary {
  totalItems: number
  successItems: number
  totalConductorWeight: number
  totalCopperWeight: number
  totalBraidShieldWeight: number
  totalCopperTapeWeight: number
  totalPairShieldWeight: number
  totalGroundWireWeight: number
}

export default function Home() {
  // === 型号列表 ===
  const [models, setModels] = useState<CableModelDB[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [modelSpecs, setModelSpecs] = useState<CableSpecDB[]>([])

  // === 输入区状态 ===
  const [selectedCore, setSelectedCore] = useState<string>('')
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [lengthM, setLengthM] = useState<string>('')
  const [shieldType, setShieldType] = useState<string>('tape')
  const [batchInput, setBatchInput] = useState<string>('')
  const [batchLoading, setBatchLoading] = useState(false)

  // === 导体类型（A类/B类）===
  const [conductorType, setConductorType] = useState<'A' | 'B'>('A')

  // === 结果区状态 ===
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([])
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null)
  const [resultOpen, setResultOpen] = useState(true)
  const [paramsOpen, setParamsOpen] = useState(false)

  // === 汇总勾选：控制哪些分量计入总铜重 ===
  const [includePairShield, setIncludePairShield] = useState(true)
  const [includeBraidShield, setIncludeBraidShield] = useState(true)
  const [includeCopperTape, setIncludeCopperTape] = useState(true)
  const [includeGroundWire, setIncludeGroundWire] = useState(true)

  // === 管理界面状态 ===
  const [showManage, setShowManage] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [newModelDisplay, setNewModelDisplay] = useState('')
  const [newModelCategory, setNewModelCategory] = useState('控制电缆')
  const [newModelHasConductor, setNewModelHasConductor] = useState(true)
  const [newModelHasBraid, setNewModelHasBraid] = useState(false)
  const [newModelHasTape, setNewModelHasTape] = useState(true)
  const [newModelShieldType, setNewModelShieldType] = useState('tape')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const batchInputRef = useRef<HTMLTextAreaElement>(null)
  const [importModelId, setImportModelId] = useState<string>('')
  const [importModelName, setImportModelName] = useState('')
  const [importLoading, setImportLoading] = useState(false)

  // 初始KVVP数据（JSON回退）
  const fallbackSpecs: CableSpec[] = cableDataJson as CableSpec[]

  // === 加载型号列表 ===
  const loadModels = useCallback(async () => {
    try {
      const res = await fetch('/api/cable-models')
      const data = await res.json()
      if (data.models && data.models.length > 0) {
        setModels(data.models)
        if (!selectedModelId) setSelectedModelId(data.models[0].id)
      }
    } catch {
      // 数据库无数据时使用JSON回退
    }
  }, [])

  // === 加载型号的规格 ===
  const loadModelSpecs = useCallback(async () => {
    if (!selectedModelId) return
    try {
      const res = await fetch(`/api/cable-models/specs?modelId=${selectedModelId}`)
      const data = await res.json()
      if (data.specs && data.specs.length > 0) {
        setModelSpecs(data.specs)
      } else {
        setModelSpecs([])
      }
    } catch {
      setModelSpecs([])
    }
  }, [selectedModelId])

  // 当选中的型号变化时，同步导体类型状态
  useEffect(() => {
    const m = models.find(x => x.id === selectedModelId)
    if (m) {
      if (m.name === 'DJYPVP-B') setConductorType('B')
      else if (/^DJYPVP/.test(m.name)) setConductorType('A')
    }
  }, [selectedModelId, models])

  useEffect(() => { loadModels() }, [loadModels])
  useEffect(() => { loadModelSpecs() }, [loadModelSpecs])

  // 当前型号
  const currentModel = models.find(m => m.id === selectedModelId)
  const hasBraid = currentModel?.hasBraidShield ?? true
  const hasTape = currentModel?.hasCopperTape ?? true
  const hasNeutral = currentModel?.hasNeutralConductor ?? false
  const defaultShield = currentModel?.defaultShieldType || (hasTape ? 'tape' : hasBraid ? 'braid' : 'none')

  // 当前型号名称（考虑A/B类切换）
  const currentModelName = currentModel?.name || ''
  const isDJYPVPModel = /^DJYPVP/.test(currentModelName) || /^DJYVPR/.test(currentModelName) || /^DJYVRP/.test(currentModelName)

  // 当切换导体类型时，自动切换到对应的modelId
  const handleConductorTypeChange = useCallback((type: 'A' | 'B') => {
    setConductorType(type)
    if (isDJYPVPModel) {
      const targetName = type === 'B' ? 'DJYPVP-B' : 'DJYPVP'
      const targetModel = models.find(m => m.name === targetName)
      if (targetModel) {
        setSelectedModelId(targetModel.id)
        setShieldType(targetModel.defaultShieldType)
      }
    }
  }, [isDJYPVPModel, models])

  // 当前使用的规格数据（数据库优先，JSON回退）
  const activeSpecs = modelSpecs.length > 0
    ? modelSpecs.map(s => ({
        model: s.model?.name || 'KVVP',
        spec: s.spec,
        conductorDiameter: s.conductorDiameter,
        coreCount: s.coreCount,
        copperDensity: s.copperDensity,
        wrapDiameter: s.wrapDiameter,
        wireDiameter: s.wireDiameter,
        copperTapeWeightPerKm: s.copperTapeWeightPerKm,
        neutralCoreCount: s.neutralCoreCount || 0,
        neutralWireCount: s.neutralWireCount || 0,
        neutralWireDiameter: s.neutralWireDiameter || 0,
        pairCount: s.pairCount || 0,
        coresPerPair: s.coresPerPair || 0,
        pairWrapDiameter: s.pairWrapDiameter || 0,
        pairWireDiameter: s.pairWireDiameter || 0,
        groundWireWeightPerKm: s.groundWireWeightPerKm || 0,
        tapeShieldWeightPerKm: s.tapeShieldWeightPerKm || 0,
      }))
    : fallbackSpecs

  // 解析规格字符串为芯数和截面积（支持复合规格如 "3*35+1*16"）
  const parseSpecStr = (spec: string) => {
    const mainPart = spec.includes('+') ? spec.split('+')[0] : spec
    const parts = mainPart.split('*')
    return { cores: parseInt(parts[0]) || 0, section: parseFloat(parts[1]) || 0 }
  }

  const crossSections = [...new Set(activeSpecs.map(s => parseSpecStr(s.spec).section))].sort((a, b) => a - b)
  const coreCounts = [...new Set(activeSpecs.map(s => parseSpecStr(s.spec).cores))].sort((a, b) => a - b)

  const shieldTypeOptions = [
    ...(hasTape ? [{ value: 'tape', label: '铜带屏蔽 (P2)' }] : []),
    ...(hasBraid ? [{ value: 'braid', label: '编织屏蔽' }] : []),
    ...(hasTape && hasBraid ? [{ value: 'both', label: '两者都有' }] : []),
    ...(!hasTape && !hasBraid ? [{ value: 'none', label: '无屏蔽' }] : []),
  ]

  const availableSections = useMemo(() => {
    if (!selectedCore) return crossSections
    const core = parseInt(selectedCore)
    return [...new Set(activeSpecs.filter(s => parseSpecStr(s.spec).cores === core).map(s => parseSpecStr(s.spec).section))].sort((a, b) => a - b)
  }, [selectedCore, activeSpecs])

  const availableCores = useMemo(() => {
    if (!selectedSection) return coreCounts
    const section = parseFloat(selectedSection)
    return [...new Set(activeSpecs.filter(s => parseSpecStr(s.spec).section === section).map(s => parseSpecStr(s.spec).cores))].sort((a, b) => a - b)
  }, [selectedSection, activeSpecs])

  const matchedSpec = useMemo(() => {
    if (!selectedCore || !selectedSection) return null
    // 查找匹配的规格（优先简单规格，其次复合规格）
    const simpleMatch = activeSpecs.find(s => s.spec === `${selectedCore}*${selectedSection}`)
    if (simpleMatch) return simpleMatch
    // 对YJV等复合规格，找第一个匹配主导体参数的
    return activeSpecs.find(s => {
      const parsed = parseSpecStr(s.spec)
      return parsed.cores === parseInt(selectedCore) && parsed.section === parseFloat(selectedSection)
    }) || null
  }, [selectedCore, selectedSection, activeSpecs])

  // === 单条添加 ===
  const handleAddSingle = useCallback(() => {
    const cores = parseInt(selectedCore)
    const section = parseFloat(selectedSection)
    const length = parseFloat(lengthM)
    if (!cores || !section || !length || length <= 0) {
      toast.error('请填写完整的计算参数')
      return
    }
    // 查找匹配规格（优先精确匹配，其次主导体匹配）
    const spec = activeSpecs.find(s => s.spec === `${cores}*${section}`)
      || activeSpecs.find(s => {
        const parsed = parseSpecStr(s.spec)
        return parsed.cores === cores && parsed.section === section
      })
    if (!spec) {
      toast.error(`未找到匹配规格: ${cores}芯 × ${section}mm²`)
      return
    }
    const st = shieldType || defaultShield
    const result = calcTotalCopperWeight(spec, length, st as 'braid' | 'tape' | 'both' | 'none')
    const modelName = currentModel?.name || 'KVVP'
    const newItem: BatchResultItem = {
      materialInfo: `${modelName} ${cores}×${section} ${length}m`,
      lengthM: length,
      parsed: { prefix: modelName, model: modelName, voltage: '', cores, crossSection: section },
      result,
    }
    const newResults = [...batchResults, newItem]
    recalcSummary(newResults)
    setBatchResults(newResults)
    setResultOpen(true)
    toast.success('已添加到计算结果')
  }, [selectedCore, selectedSection, lengthM, shieldType, activeSpecs, batchResults, currentModel, defaultShield])

  // === 批量计算 ===
  const handleBatchCalculate = useCallback(async () => {
    if (!batchInput.trim()) { toast.error('请输入物料信息'); return }
    setBatchLoading(true)
    try {
      const lines = batchInput.trim().split('\n').filter(l => l.trim())
      const items: { materialInfo: string; lengthM: number }[] = []
      for (const line of lines) {
        const trimmedLine = line.trim()
        
        // 尝试多种分离方式提取物料信息和长度
        const separators = [
          /^(.+?)\s+(\d+\.?\d*)\s*$/,   // 空格分隔
          /^(.+?),(\d+\.?\d*)\s*$/,      // 逗号分隔
          /^(.+?)\t(\d+\.?\d*)\s*$/,     // Tab分隔
        ]
        
        let matched = false
        for (const pattern of separators) {
          const match = trimmedLine.match(pattern)
          if (match) {
            const infoPart = match[1].trim()
            const lengthPart = parseFloat(match[2])
            const parsed = parseMaterialInfo(infoPart)
            if (parsed) {
              items.push({ materialInfo: infoPart, lengthM: lengthPart })
              matched = true
              break
            }
            // 如果去掉最后一个数字后解析失败，尝试把整行当物料信息
            // 例如: "BVR 450/750V 6 200" 可能需要把 "BVR 450/750V 6" 作为物料信息
          }
        }
        
        if (!matched) {
          // 尝试解析整行（无长度）
          const parsed = parseMaterialInfo(trimmedLine)
          if (parsed) {
            items.push({ materialInfo: trimmedLine, lengthM: 0 })
          }
        }
      }
      if (items.length === 0) { toast.error('未能解析出有效信息'); setBatchLoading(false); return }

      const res = await fetch('/api/copper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', items, modelId: selectedModelId || undefined, conductorType: conductorType || undefined }),
      })
      const data = await res.json()
      if (data.results) {
        const newResults = [...batchResults, ...data.results.map((r: any) => ({
          ...r,
          result: r.result ? { ...r.result } : undefined,
        }))]
        setBatchResults(newResults)
        recalcSummary(newResults)
        setResultOpen(true)
        toast.success(`计算完成: ${data.summary.successItems}/${data.summary.totalItems} 条成功`)
      } else {
        toast.error(data.error || '计算失败')
      }
    } catch (err) {
      toast.error('计算出错: ' + (err as Error).message)
    } finally {
      setBatchLoading(false)
    }
  }, [batchInput, selectedModelId, batchResults])

  // === 重新计算汇总 ===
  const recalcSummary = (results: BatchResultItem[]) => {
    let tc = 0, tn = 0, tb = 0, tt = 0, tp = 0, tg = 0
    for (const item of results) {
      if (item.result) {
        tc += item.result.conductorWeight
        tn += item.result.neutralConductorWeight || 0
        tb += item.result.braidShieldWeight
        tt += item.result.copperTapeWeight
        tp += item.result.pairShieldWeight || 0
        tg += item.result.groundWireWeight || 0
      }
    }
    // 根据勾选状态计算总铜重
    let tw = tc + tn
    if (includePairShield) tw += tp
    if (includeBraidShield) tw += tb
    if (includeCopperTape) tw += tt
    if (includeGroundWire) tw += tg
    setBatchSummary({
      totalItems: results.length,
      successItems: results.filter(r => r.result).length,
      totalConductorWeight: Math.round((tc + tn) * 100) / 100,
      totalCopperWeight: Math.round(tw * 100) / 100,
      totalBraidShieldWeight: Math.round(tb * 100) / 100,
      totalCopperTapeWeight: Math.round(tt * 100) / 100,
      totalPairShieldWeight: Math.round(tp * 100) / 100,
      totalGroundWireWeight: Math.round(tg * 100) / 100,
    })
  }

  // 勾选变化时重新计算汇总
  useEffect(() => {
    if (batchResults.length > 0) {
      recalcSummary(batchResults)
    }
  }, [includePairShield, includeBraidShield, includeCopperTape, includeGroundWire])

  // === 创建新型号 ===
  const handleCreateModel = useCallback(async () => {
    if (!newModelName.trim()) { toast.error('请输入型号代码'); return }
    try {
      const res = await fetch('/api/cable-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newModelName.trim(),
          displayName: newModelDisplay.trim() || newModelName.trim(),
          category: newModelCategory,
          hasConductor: newModelHasConductor,
          hasBraidShield: newModelHasBraid,
          hasCopperTape: newModelHasTape,
          defaultShieldType: newModelShieldType,
        }),
      })
      const data = await res.json()
      if (data.model) {
        toast.success(`型号 "${data.model.displayName}" 创建成功`)
        setNewModelName(''); setNewModelDisplay('')
        await loadModels()
        setSelectedModelId(data.model.id)
      } else {
        toast.error(data.error || '创建失败')
      }
    } catch (err) { toast.error('创建出错') }
  }, [newModelName, newModelDisplay, newModelCategory, loadModels])

  // === Excel导入 ===
  const handleImportExcel = useCallback(async () => {
    const fileInput = fileInputRef.current
    if (!fileInput?.files?.length) { toast.error('请选择Excel文件'); return }
    setImportLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', fileInput.files[0])
      if (importModelId) formData.append('modelId', importModelId)
      if (importModelName) formData.append('modelName', importModelName)
      if (!importModelId && importModelName) {
        formData.append('displayName', importModelName)
        formData.append('category', newModelCategory)
      }

      const res = await fetch('/api/cable-models/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        toast.success(`导入成功: ${data.imported} 条规格数据`)
        await loadModels()
        await loadModelSpecs()
        setShowManage(false)
      } else {
        toast.error(data.error || '导入失败')
      }
    } catch (err) { toast.error('导入出错') }
    finally { setImportLoading(false) }
  }, [importModelId, importModelName, loadModels, loadModelSpecs])

  // === 初始化：迁移KVVP数据到数据库 ===
  const handleInitKVVP = useCallback(async () => {
    try {
      // 创建KVVP型号
      const res = await fetch('/api/cable-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'KVVP',
          displayName: '控制电缆KVVP',
          category: '控制电缆',
          hasConductor: true,
          hasBraidShield: true,
          hasCopperTape: true,
          defaultShieldType: 'braid',
        }),
      })
      const data = await res.json()
      if (!data.model) { toast.error(data.error || '创建型号失败'); return }
      const modelId = data.model.id

      // 批量写入规格
      const specsPayload = fallbackSpecs.map(s => ({
        modelId,
        spec: s.spec,
        conductorDiameter: s.conductorDiameter,
        coreCount: s.coreCount,
        copperDensity: s.copperDensity,
        wrapDiameter: s.wrapDiameter,
        wireDiameter: s.wireDiameter,
        copperTapeWeightPerKm: s.copperTapeWeightPerKm,
      }))

      const specRes = await fetch('/api/cable-models/specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specs: specsPayload }),
      })
      const specData = await specRes.json()
      if (specData.count) {
        toast.success(`KVVP数据初始化成功: ${specData.count} 条规格`)
        setSelectedModelId(modelId)
        await loadModels()
        await loadModelSpecs()
      }
    } catch (err) { toast.error('初始化出错') }
  }, [loadModels, loadModelSpecs])

  // === 删除型号 ===
  const handleDeleteModel = useCallback(async (id: string) => {
    try {
      await fetch(`/api/cable-models?id=${id}`, { method: 'DELETE' })
      toast.success('型号已删除')
      await loadModels()
      if (selectedModelId === id) setSelectedModelId('')
    } catch (err) { toast.error('删除出错') }
  }, [loadModels, selectedModelId])

  const dbHasData = models.length > 0

  const exampleInput = currentModel?.name === 'BVR' || (!currentModel && !dbHasData)
    ? `BVR 450/750V 6 200\nBVR 450/750V 16 100\nBVR 450/750V 50 15\nBVR 450/750V 4 500\nBVR 450/750V 10 300`
    : currentModel?.name === 'YJV' || currentModel?.name === 'YJV22'
    ? `YJV 0.6/1KV 3×35+1×16 200\nYJV 3×70 100\nYJV 0.6/1KV 4×50+1×25 150\nYJV 1×120 300\nYJV 2×16 500`
    : `ZA-KVVP2-22 450/750V 14×2.5 1938\nZB-KVVP2-22 450/750V 7×2.5 2348\nZA-KVVP2-22 450/750V 7×4 422\nZB-KVVP2-22 450/750V 10×2.5 762\nZB-KVVP2-22 450/750V 4×2.5 1286\nZB-KVVP2-22 450/750V 4×4 2993\nNH-KVVP2-22 450/750V 4×4 500`

  const handleClear = () => { setBatchResults([]); setBatchSummary(null) }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow">Cu</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">电缆铜重计算系统</h1>
              <p className="text-[11px] text-gray-400">控制电缆 / 电力电缆 铜材用量计算</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowManage(!showManage)}>
            <Settings2 className="w-3.5 h-3.5" />
            型号管理
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ===== 型号管理面板（可折叠） ===== */}
        <Collapsible open={showManage} onOpenChange={setShowManage}>
          <CollapsibleContent>
            <Card className="shadow-sm border-blue-200 bg-blue-50/30">
              <CardContent className="p-5 space-y-5">
                <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />型号管理
                </h3>

                {/* 已有型号列表 */}
                {dbHasData && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">已有型号</p>
                    <div className="flex flex-wrap gap-2">
                      {models.map(m => (
                        <Badge
                          key={m.id}
                          variant={m.id === selectedModelId ? 'default' : 'outline'}
                          className={`cursor-pointer px-3 py-1.5 text-xs ${m.id === selectedModelId ? 'bg-amber-600 text-white' : 'hover:bg-amber-50'}`}
                          onClick={() => { setSelectedModelId(m.id); setShieldType(m.defaultShieldType) }}
                        >
                          {m.displayName} ({m._count?.specs || 0}种)
                          <Trash2 className="w-3 h-3 ml-1.5 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleDeleteModel(m.id) }} />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 无数据提示 */}
                {!dbHasData && (
                  <div className="text-center py-4 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-700 mb-2">数据库中暂无电缆型号</p>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs" onClick={handleInitKVVP}>
                      初始化 KVVP 数据（147种规格）
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* 新增型号 */}
                  <div className="rounded-lg bg-white p-4 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> 新增型号
                    </p>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-gray-400">型号代码</Label>
                          <Input placeholder="如 YJV" className="h-8 text-xs" value={newModelName} onChange={e => setNewModelName(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-400">显示名称</Label>
                          <Input placeholder="如 电力电缆YJV" className="h-8 text-xs" value={newModelDisplay} onChange={e => setNewModelDisplay(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-400">分类</Label>
                        <Select value={newModelCategory} onValueChange={setNewModelCategory}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="控制电缆">控制电缆</SelectItem>
                            <SelectItem value="电力电缆">电力电缆</SelectItem>
                            <SelectItem value="通信电缆">通信电缆</SelectItem>
                            <SelectItem value="其他">其他</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <Checkbox checked={newModelHasConductor} onCheckedChange={(v) => setNewModelHasConductor(!!v)} className="h-3.5 w-3.5" /> 导体
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <Checkbox checked={newModelHasBraid} onCheckedChange={(v) => { setNewModelHasBraid(!!v); if (!!v && newModelShieldType === 'none') setNewModelShieldType('braid') }} className="h-3.5 w-3.5" /> 编织屏蔽
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <Checkbox checked={newModelHasTape} onCheckedChange={(v) => { setNewModelHasTape(!!v); if (!!v && newModelShieldType === 'none') setNewModelShieldType('tape') }} className="h-3.5 w-3.5" /> 铜带P2
                        </label>
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-400">默认屏蔽类型</Label>
                        <Select value={newModelShieldType} onValueChange={setNewModelShieldType}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {newModelHasBraid && newModelHasTape && <SelectItem value="both">两者都有</SelectItem>}
                            {newModelHasTape && <SelectItem value="tape">铜带屏蔽 (P2)</SelectItem>}
                            {newModelHasBraid && <SelectItem value="braid">编织屏蔽</SelectItem>}
                            {!newModelHasBraid && !newModelHasTape && <SelectItem value="none">无屏蔽</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs" onClick={handleCreateModel}>创建型号</Button>
                    </div>
                  </div>

                  {/* Excel导入 */}
                  <div className="rounded-lg bg-white p-4 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel导入
                    </p>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[11px] text-gray-400">导入到型号</Label>
                        <Select value={importModelId} onValueChange={setImportModelId}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择已有型号或输入新型号" /></SelectTrigger>
                          <SelectContent>
                            {models.map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                            ))}
                            <SelectItem value="__new__">+ 新型号...</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {importModelId === '__new__' && (
                        <div>
                          <Label className="text-[11px] text-gray-400">新型号名称</Label>
                          <Input placeholder="如 YJV" className="h-8 text-xs" value={importModelName} onChange={e => setImportModelName(e.target.value)} />
                        </div>
                      )}
                      <div>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100" />
                      </div>
                      <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white text-xs" onClick={handleImportExcel} disabled={importLoading}>
                        {importLoading ? '导入中...' : '导入Excel'}
                      </Button>
                      <p className="text-[10px] text-gray-400">支持与KVVP相同格式的Excel文件，自动识别列映射</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* ===== 输入区 ===== */}
        <Card className="shadow-sm border-gray-200">
          <CardContent className="p-5">
            {/* 型号选择器 */}
            <div className="mb-4 flex items-center gap-3">
              <Label className="text-xs text-gray-500 whitespace-nowrap">当前型号</Label>
              {dbHasData ? (
                <Select value={selectedModelId} onValueChange={(v) => { setSelectedModelId(v); const m = models.find(x => x.id === v); if (m) setShieldType(m.defaultShieldType) }}>
                  <SelectTrigger className="h-8 text-xs w-56"><SelectValue placeholder="选择电缆型号" /></SelectTrigger>
                  <SelectContent>
                    {models.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.displayName} ({m._count?.specs || 0}种规格)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="text-xs text-amber-600">KVVP (本地数据·点击"型号管理"初始化)</Badge>
              )}
              {currentModel && (
                <div className="flex gap-1 ml-2">
                  {currentModel.hasConductor && <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-200">导体</Badge>}
                  {currentModel.hasBraidShield && <Badge variant="outline" className="text-[10px] text-purple-500 border-purple-200">编织屏蔽</Badge>}
                  {currentModel.hasCopperTape && <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-200">铜带P2</Badge>}
                </div>
              )}
              {/* 导体类型 A/B 切换按钮（仅DJYPVP系列显示） */}
              {isDJYPVPModel && (
                <div className="flex items-center gap-1 ml-3">
                  <Label className="text-[11px] text-gray-500 whitespace-nowrap">导体类型</Label>
                  <div className="flex rounded-md overflow-hidden border border-gray-300">
                    <button
                      type="button"
                      className={`px-3 py-1 text-xs font-medium transition-colors ${conductorType === 'A' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      onClick={() => handleConductorTypeChange('A')}
                    >
                      A类(1根)
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 text-xs font-medium transition-colors border-l border-gray-300 ${conductorType === 'B' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      onClick={() => handleConductorTypeChange('B')}
                    >
                      B类(7根)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 单条添加 */}
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-600" /> 单条添加
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                <div>
                  <Label className="text-xs text-gray-500 mb-1">芯数</Label>
                  <Select value={selectedCore} onValueChange={(v) => { setSelectedCore(v); setSelectedSection('') }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="芯数" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {availableCores.map(c => <SelectItem key={c} value={c.toString()}>{c} 芯</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">截面积</Label>
                  <Select value={selectedSection} onValueChange={setSelectedSection}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="mm²" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {availableSections.map(s => <SelectItem key={s} value={s.toString()}>{s} mm²</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">长度(m)</Label>
                  <Input type="number" placeholder="米" value={lengthM} onChange={e => setLengthM(e.target.value)} className="h-9 text-sm" min={0} step={1} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">屏蔽</Label>
                  <Select value={shieldType} onValueChange={setShieldType}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {shieldTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="h-9 bg-amber-600 hover:bg-amber-700 text-white text-sm" onClick={handleAddSingle}>添加</Button>
              </div>
              {matchedSpec && (
                <div className="mt-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-100 text-[11px] text-amber-700 flex flex-wrap gap-x-4 gap-y-1">
                  <span>导体丝径: <strong>{matchedSpec.conductorDiameter}mm</strong></span>
                  <span>等效芯数: <strong>{matchedSpec.coreCount}</strong></span>
                  {matchedSpec.neutralWireDiameter > 0 && (
                    <>
                      <span>中性丝径: <strong>{matchedSpec.neutralWireDiameter}mm</strong></span>
                      <span>中性芯×根: <strong>{matchedSpec.neutralCoreCount}×{matchedSpec.neutralWireCount}</strong></span>
                    </>
                  )}
                  {matchedSpec.wrapDiameter > 0 && <span>绕包外径: <strong>{matchedSpec.wrapDiameter}mm</strong></span>}
                  {matchedSpec.wireDiameter > 0 && <span>丝材直径: <strong>{matchedSpec.wireDiameter}mm</strong></span>}
                  {matchedSpec.copperTapeWeightPerKm > 0 && <span>铜带重/km: <strong>{matchedSpec.copperTapeWeightPerKm.toFixed(2)}kg</strong></span>}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 my-4" />

            {/* 批量输入 */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" /> 批量输入
              </h3>
              <div className="flex gap-3">
                <Textarea ref={batchInputRef} placeholder="每行一条：物料信息 + 空格 + 数量(m)" className="min-h-[100px] font-mono text-xs flex-1" value={batchInput} onChange={e => setBatchInput(e.target.value)} />
                <div className="flex flex-col gap-2">
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white text-sm h-9" onClick={handleBatchCalculate} disabled={batchLoading}>
                    {batchLoading ? '计算中...' : '批量计算'}
                  </Button>
                  <Button variant="outline" className="text-xs h-9" onClick={() => setBatchInput(exampleInput)}>填入示例</Button>
                  <Button variant="outline" className="text-xs h-9 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setBatchInput(''); setBatchResults([]); setBatchSummary(null); batchInputRef.current?.focus(); }}>清空粘贴</Button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                格式: 物料信息 长度（空格/逗号分隔）· 支持 KVVP（如 ZA-KVVP2-22 450/750V 14×2.5 1938）、BVR（如 BVR 450/750V 6 200）、YJV（如 YJV 0.6/1KV 3×35+1×16 200）等型号
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ===== 结果区 ===== */}
        {batchResults.length > 0 && (
          <Collapsible open={resultOpen} onOpenChange={setResultOpen}>
            <Card className="shadow-sm border-gray-200">
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 px-5 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
                  <Checkbox checked={resultOpen} onCheckedChange={() => setResultOpen(!resultOpen)} />
                  <span className="text-sm font-semibold text-gray-800">批量计算结果</span>
                  <span className="text-[11px] text-gray-400 ml-1">({batchSummary?.totalItems} 条)</span>
                  <div className="ml-auto">{resultOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-5 pt-4 space-y-4">
                  {batchSummary && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <div className="text-center py-3 px-2 rounded-lg bg-red-50 border border-red-100">
                        <p className="text-xs text-red-500 mb-0.5">导体+中性</p>
                        <p className="text-lg font-bold text-red-600">{batchSummary.totalConductorWeight.toFixed(2)}<span className="text-xs ml-0.5 font-normal">kg</span></p>
                      </div>
                      <div className="text-center py-3 px-2 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-xs text-amber-600 mb-0.5">总铜重</p>
                        <p className="text-2xl font-bold text-amber-600">{batchSummary.totalCopperWeight.toFixed(2)}<span className="text-sm ml-0.5 font-normal">kg</span></p>
                      </div>
                      <div className={`text-center py-3 px-2 rounded-lg border ${includePairShield ? 'bg-indigo-50 border-indigo-100' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                        <label className="flex items-center justify-center gap-1 cursor-pointer mb-0.5">
                          <Checkbox checked={includePairShield} onCheckedChange={(v) => setIncludePairShield(!!v)} className="h-3 w-3" />
                          <span className="text-xs text-indigo-500">对屏</span>
                        </label>
                        <p className={`text-lg font-bold ${includePairShield ? 'text-indigo-600' : 'text-gray-400'}`}>{batchSummary.totalPairShieldWeight.toFixed(2)}<span className="text-xs ml-0.5 font-normal">kg</span></p>
                      </div>
                      <div className={`text-center py-3 px-2 rounded-lg border ${includeBraidShield ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                        <label className="flex items-center justify-center gap-1 cursor-pointer mb-0.5">
                          <Checkbox checked={includeBraidShield} onCheckedChange={(v) => setIncludeBraidShield(!!v)} className="h-3 w-3" />
                          <span className="text-xs text-purple-500">总屏</span>
                        </label>
                        <p className={`text-lg font-bold ${includeBraidShield ? 'text-purple-600' : 'text-gray-400'}`}>{batchSummary.totalBraidShieldWeight.toFixed(2)}<span className="text-xs ml-0.5 font-normal">kg</span></p>
                      </div>
                      <div className={`text-center py-3 px-2 rounded-lg border ${includeCopperTape ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                        <label className="flex items-center justify-center gap-1 cursor-pointer mb-0.5">
                          <Checkbox checked={includeCopperTape} onCheckedChange={(v) => setIncludeCopperTape(!!v)} className="h-3 w-3" />
                          <span className="text-xs text-emerald-500">铜带</span>
                        </label>
                        <p className={`text-lg font-bold ${includeCopperTape ? 'text-emerald-600' : 'text-gray-400'}`}>{batchSummary.totalCopperTapeWeight.toFixed(2)}<span className="text-xs ml-0.5 font-normal">kg</span></p>
                      </div>
                      <div className={`text-center py-3 px-2 rounded-lg border ${includeGroundWire ? 'bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                        <label className="flex items-center justify-center gap-1 cursor-pointer mb-0.5">
                          <Checkbox checked={includeGroundWire} onCheckedChange={(v) => setIncludeGroundWire(!!v)} className="h-3 w-3" />
                          <span className="text-xs text-gray-500">接地线</span>
                        </label>
                        <p className={`text-lg font-bold ${includeGroundWire ? 'text-gray-600' : 'text-gray-400'}`}>{batchSummary.totalGroundWireWeight.toFixed(2)}<span className="text-xs ml-0.5 font-normal">kg</span></p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-gray-400">共 {batchSummary?.totalItems} 条 / 成功 {batchSummary?.successItems} 条</p>
                    <Button variant="ghost" size="sm" className="text-xs text-gray-400 h-7" onClick={handleClear}>清空结果</Button>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-[70vh]">
                      <Table>
                        <TableHeader className="bg-gray-50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="text-xs font-semibold text-gray-600">物料信息</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right">长度</TableHead>
                            <TableHead className="text-xs font-semibold text-blue-600 text-right">导体</TableHead>
                            <TableHead className="text-xs font-semibold text-cyan-600 text-right">中性</TableHead>
                            <TableHead className="text-xs font-semibold text-indigo-600 text-right">对屏</TableHead>
                            <TableHead className="text-xs font-semibold text-purple-600 text-right">总屏</TableHead>
                            <TableHead className="text-xs font-semibold text-emerald-600 text-right">铜带</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right">接地线</TableHead>
                            <TableHead className="text-xs font-semibold text-amber-600 text-right">总铜重</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batchResults.map((item, idx) => (
                            <TableRow key={idx} className="hover:bg-amber-50/30">
                              <TableCell className="text-xs py-2">
                                {item.error ? <span className="text-red-500 text-[11px]">{item.error}</span> : (
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">{item.parsed?.prefix}</Badge>
                                    <span className="font-medium">{item.parsed?.pairCount && item.parsed.coresPerPair ? `${item.parsed.pairCount}×${item.parsed.coresPerPair}×${item.parsed.crossSection}` : `${item.parsed?.cores}×${item.parsed?.crossSection}`}{item.parsed?.neutralCores ? `+${item.parsed.neutralCores}×${item.parsed.neutralCrossSection}` : ''}</span>
                                    {item.result && (item.result as any).aliasNote && <span className="text-[10px] text-gray-400 ml-1">({(item.result as any).aliasNote})</span>}
                                    {item.result && (item.result as any).matchedModelName && !(item.result as any).aliasNote && <span className="text-[10px] text-gray-400 ml-1">[{(item.result as any).matchedModelName}]</span>}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-right text-gray-600 py-2">{item.lengthM}m</TableCell>
                              <TableCell className="text-xs text-right text-blue-600 py-2">{item.result ? item.result.conductorWeight.toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-xs text-right text-cyan-600 py-2">{item.result && item.result.neutralConductorWeight > 0 ? item.result.neutralConductorWeight.toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-xs text-right text-indigo-600 py-2">{item.result && (item.result.pairShieldWeight ?? 0) > 0 ? item.result.pairShieldWeight.toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-xs text-right text-purple-600 py-2">{item.result && item.result.braidShieldWeight > 0 ? item.result.braidShieldWeight.toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-xs text-right text-emerald-600 py-2">{item.result && item.result.copperTapeWeight > 0 ? item.result.copperTapeWeight.toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-xs text-right text-gray-600 py-2">{item.result && (item.result.groundWireWeight ?? 0) > 0 ? item.result.groundWireWeight.toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-xs text-right font-bold text-amber-600 py-2">{item.result ? (() => {
                                let w = item.result.conductorWeight + (item.result.neutralConductorWeight || 0)
                                if (includePairShield) w += (item.result.pairShieldWeight || 0)
                                if (includeBraidShield) w += item.result.braidShieldWeight
                                if (includeCopperTape) w += item.result.copperTapeWeight
                                if (includeGroundWire) w += (item.result.groundWireWeight || 0)
                                return w.toFixed(2)
                              })() : '-'} kg</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* ===== 参数库（折叠） ===== */}
        <Collapsible defaultOpen={false} onOpenChange={setParamsOpen}>
          <Card className="shadow-sm border-gray-200">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 px-5 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
                <Checkbox checked={paramsOpen} />
                <span className="text-sm font-semibold text-gray-800">电缆参数库</span>
                <span className="text-[11px] text-gray-400 ml-1">({activeSpecs.length} 种规格)</span>
                <div className="ml-auto">{paramsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-5 pt-4">
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader className="bg-gray-50 sticky top-0">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">规格</TableHead>
                        <TableHead className="text-xs font-semibold text-right">导体丝径</TableHead>
                        <TableHead className="text-xs font-semibold text-right">等效芯数</TableHead>
                        <TableHead className="text-xs font-semibold text-right">铜比重</TableHead>
                        <TableHead className="text-xs font-semibold text-right">中性丝径</TableHead>
                        <TableHead className="text-xs font-semibold text-right">中性芯×根</TableHead>
                        <TableHead className="text-xs font-semibold text-right">绕包外径</TableHead>
                        <TableHead className="text-xs font-semibold text-right">丝材直径</TableHead>
                        <TableHead className="text-xs font-semibold text-right">铜带重/km</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeSpecs.map((spec, idx) => (
                        <TableRow key={idx} className="hover:bg-amber-50/30">
                          <TableCell className="text-xs font-medium py-1.5"><Badge variant="secondary" className="text-[11px]">{spec.spec}</Badge></TableCell>
                          <TableCell className="text-xs text-right py-1.5">{spec.conductorDiameter} mm</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{spec.coreCount}</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{spec.copperDensity}</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{(spec.neutralWireDiameter > 0) ? `${spec.neutralWireDiameter} mm` : '-'}</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{(spec.neutralCoreCount > 0) ? `${spec.neutralCoreCount}×${spec.neutralWireCount}` : '-'}</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{spec.wrapDiameter || '-'}</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{spec.wireDiameter || '-'}</TableCell>
                          <TableCell className="text-xs text-right font-medium text-amber-700 py-1.5">{spec.copperTapeWeightPerKm > 0 ? `${spec.copperTapeWeightPerKm.toFixed(2)} kg` : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </main>

      <footer className="py-3 border-t border-gray-100 bg-white/50 mt-auto">
        <div className="max-w-6xl mx-auto px-4 text-center text-[11px] text-gray-300">电缆铜重计算系统 · 多型号支持 · 铜比重 8.9 g/cm³</div>
      </footer>
    </div>
  )
}
