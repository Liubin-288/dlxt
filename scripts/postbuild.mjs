import { cpSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const standalone = join(root, '.next/standalone')

// 1. Copy .next/static
const staticSrc = join(root, '.next/static')
const staticDst = join(standalone, '.next/static')
if (existsSync(staticSrc)) { cpSync(staticSrc, staticDst, { recursive: true }); console.log('✅ .next/static') }

// 2. Copy public
const publicSrc = join(root, 'public')
const publicDst = join(standalone, 'public')
if (existsSync(publicSrc)) { cpSync(publicSrc, publicDst, { recursive: true }); console.log('✅ public') }

// 3. Copy prisma
const prismaSrc = join(root, 'prisma')
const prismaDst = join(standalone, 'prisma')
if (existsSync(prismaSrc)) { cpSync(prismaSrc, prismaDst, { recursive: true }); console.log('✅ prisma') }

// 4. Copy db
const dbSrc = join(root, 'db')
const dbDst = join(standalone, 'db')
if (existsSync(dbSrc)) { cpSync(dbSrc, dbDst, { recursive: true }); console.log('✅ db') }

// 5. Copy .env
const envSrc = join(root, '.env')
const envDst = join(standalone, '.env')
if (existsSync(envSrc)) { cpSync(envSrc, envDst, { force: true }); console.log('✅ .env') }

console.log('🎉 Postbuild done!')
