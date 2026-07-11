const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const models = await p.cableModel.findMany({ select: { name: true, displayName: true, category: true, _count: { select: { specs: true } } } });
  console.log('Cable Models in DB:', JSON.stringify(models, null, 2));
  await p.$disconnect();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
