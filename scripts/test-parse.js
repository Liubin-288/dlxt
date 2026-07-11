// 测试预处理函数和解析逻辑
const { parseMaterialInfo, resolveModelAlias } = require('../src/lib/copper-calculator')

const cases = [
  // 用户提到的横杠多的例子
  'N-YJV-0.6/1kV 3*4',
  'N-YJV-0.6/1kV 3*35+1*16',
  // 铠装后缀
  'YJV22 0.6/1kV 3*4',
  'YJV22-22 0.6/1kV 3*4',
  'YJV-22 0.6/1kV 3*4',
  'YJV23 0.6/1kV 3*4',
  'NH-YJV22-22 0.6/1kV 3*4',
  // 阻燃前缀
  'ZA-KVVP2-22 450/750V 14*2.5',
  'ZB-KVVP2-22 450/750V 7*2.5',
  // 耐火前缀
  'NH-YJV 0.6/1kV 3*4',
  'N-BVR 450/750V 6',
  // WDZN 长前缀
  'WDZN-YJV 0.6/1kV 3*4',
  // 不应误处理的
  'DJYP2VP2 2*2*0.5',
  'DJYP2VP2 450/750V 2*2*0.5',
  'DJYVPR 450/750V 2*2*0.5',
  'BVR 450/750V 6',
  'YJV 3*35+1*16',
]

console.log('=== 解析测试 ===')
for (const c of cases) {
  const r = parseMaterialInfo(c)
  if (r) {
    const alias = resolveModelAlias(r.model)
    console.log(`✓ ${c.padEnd(45)} → model=${r.model.padEnd(15)} alias=${alias.padEnd(15)} spec=${r.specStr || (r.cores + '*' + r.crossSection)}`)
  } else {
    console.log(`✗ ${c.padEnd(45)} → 解析失败`)
  }
}
