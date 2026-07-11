const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // 找到 DJYPVP 数据
  const djypvp = await p.cableModel.findUnique({ where: { name: 'DJYPVP' } });
  if (!djypvp) { console.log('No DJYPVP'); return; }
  
  const specs = await p.cableSpec.findMany({
    where: { modelId: djypvp.id },
    orderBy: [{ pairCount: 'asc' }, { spec: 'asc' }],
    take: 5
  });
  console.log('=== DJYPVP 规格样例（前5条）===');
  for (const s of specs) {
    console.log(`\nspec=${s.spec}`);
    console.log(`  pairCount=${s.pairCount}, coresPerPair=${s.coresPerPair}`);
    console.log(`  导体: conductorDiameter=${s.conductorDiameter}, coreCount=${s.coreCount}, density=${s.copperDensity}`);
    console.log(`  对屏: wireDiameter=${s.wireDiameter}, wrapDiameter=${s.wrapDiameter}`);
    console.log(`  铜带(P2): copperTapeWeightPerKm=${s.copperTapeWeightPerKm}`);
    console.log(`  接地线1: groundWire1Diameter=${s.groundWire1Diameter}, groundWire1Count=${s.groundWire1Count}`);
    console.log(`  接地线2: groundWire2Diameter=${s.groundWire2Diameter}, groundWire2Count=${s.groundWire2Count}, groundWireWeightPerKm=${s.groundWireWeightPerKm}`);
  }
  
  // 检查 2*2*0.5 规格（典型 DJYVPR 规格）
  console.log('\n=== 测试 DJYVPR 2*2*0.5 ===');
  const s = await p.cableSpec.findUnique({
    where: { modelId_spec: { modelId: djypvp.id, spec: '2*2*0.5' } }
  });
  if (s) {
    console.log('已找到 2*2*0.5 规格参数:', JSON.stringify(s, null, 2));
  } else {
    console.log('未找到 2*2*0.5');
  }
  
  await p.$disconnect();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
