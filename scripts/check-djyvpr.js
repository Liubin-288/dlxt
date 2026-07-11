const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const models = await p.cableModel.findMany({
    include: { specs: { take: 3 } }
  });
  console.log('=== 所有型号 ===');
  for (const m of models) {
    console.log(`\n[${m.name}] ${m.displayName} | 分类:${m.category}`);
    console.log(`  hasConductor=${m.hasConductor}, hasNeutralConductor=${m.hasNeutralConductor}`);
    console.log(`  hasBraidShield=${m.hasBraidShield}, hasCopperTape=${m.hasCopperTape}`);
    console.log(`  defaultShieldType=${m.defaultShieldType}`);
    console.log(`  规格总数: ${await p.cableSpec.count({ where: { modelId: m.id } })}`);
    if (m.specs.length) {
      console.log(`  示例规格: ${m.specs.map(s => s.spec).join(', ')}`);
    }
  }
  // 搜索 DJYVPR 相关
  console.log('\n=== 搜索 DJYVPR/DJYPVP 系列 ===');
  const djyModels = await p.cableModel.findMany({
    where: { OR: [
      { name: { contains: 'DJY' } },
      { name: { contains: 'DJ' } },
      { displayName: { contains: 'DJ' } },
    ]},
    include: { _count: { select: { specs: true } } }
  });
  for (const m of djyModels) {
    console.log(`- ${m.name} (${m.displayName}) | specs:${m._count.specs}`);
  }
  await p.$disconnect();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
