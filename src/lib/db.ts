import { PrismaClient } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 确保 SQLite 数据库路径在不同部署环境中正确解析
// 如果 DATABASE_URL 使用绝对路径但文件不存在，尝试从项目根目录解析
function getDatabaseUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL
  if (!envUrl) return undefined
  if (!envUrl.startsWith('file:')) return envUrl

  const filePath = envUrl.replace('file:', '')
  const fs = require('fs')
  if (fs.existsSync(filePath)) return envUrl

  // 绝对路径找不到时，尝试从 cwd 解析相对路径
  const relativePath = filePath.split('/').slice(-2).join('/') // 取 db/custom.db
  const fromCwd = path.resolve(process.cwd(), relativePath)
  if (fs.existsSync(fromCwd)) return `file:${fromCwd}`

  return envUrl
}

const databaseUrl = getDatabaseUrl()
if (databaseUrl && databaseUrl !== process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db