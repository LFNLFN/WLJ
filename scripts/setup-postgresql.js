// Railway PostgreSQL 设置助手
// 运行方式: node scripts/setup-postgresql.js
// 
// 前置条件: 先在 Railway 网页控制台添加 PostgreSQL 插件

const API_BASE = process.env.API_URL || 'https://wlj-production.up.railway.app/api';

async function checkCurrentStatus() {
  console.log('🔍 检查当前线上数据库状态...\n');
  
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    console.log(`   数据库类型: ${data.db}`);
    console.log(`   服务状态: ${data.status}`);
    return data.db;
  } catch(e) {
    console.log(`   ❌ 无法连接线上服务: ${e.message}`);
    return null;
  }
}

async function testPgConnection() {
  console.log('\n🧪 测试 PostgreSQL 连接...\n');
  
  // 检查环境变量
  const envVars = ['DATABASE_URL', 'POSTGRES_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  console.log('   需要的环境变量（任意一个）:');
  console.log('   - DATABASE_URL（Railway 自动设置）');
  console.log('   - POSTGRES_URL（Vercel 自动设置）');
  console.log('');
  console.log('   Railway 添加 PostgreSQL 后会自动设置 DATABASE_URL');
  console.log('   格式: postgresql://user:password@host:port/database');
}

async function verifyDataAfterMigration() {
  console.log('\n📋 数据验证清单...\n');
  
  const checks = [
    { path: '/students', name: '学生' },
    { path: '/teachers', name: '教师' },
    { path: '/courses', name: '课程' },
    { path: '/class-records', name: '上课记录' },
    { path: '/scale-templates', name: '量表模板' },
    { path: '/student-scale-records', name: '量表评估记录' },
  ];
  
  for (const check of checks) {
    try {
      const res = await fetch(`${API_BASE}${check.path}`);
      const data = await res.json();
      console.log(`   ✅ ${check.name}: ${Array.isArray(data) ? data.length : '?'} 条`);
    } catch(e) {
      console.log(`   ❌ ${check.name}: 获取失败`);
    }
  }
}

async function main() {
  console.log('🚀 Railway PostgreSQL 设置助手\n');
  console.log('='.repeat(60));
  console.log('📡 API 地址:', API_BASE);
  console.log('='.repeat(60));
  
  const currentDb = await checkCurrentStatus();
  
  if (currentDb === 'postgresql') {
    console.log('\n✅ PostgreSQL 已经配置成功！');
    await verifyDataAfterMigration();
    return;
  }
  
  console.log('\n⚠️  当前使用的是 SQLite，需要配置 PostgreSQL');
  
  await testPgConnection();
  
  console.log('\n' + '='.repeat(60));
  console.log('📖 配置 PostgreSQL 的步骤:');
  console.log('='.repeat(60));
  console.log(`
  步骤 1: 打开 Railway 网页控制台
          https://railway.app/project
  
  步骤 2: 找到你的项目 "wlj-production"
  
  步骤 3: 点击 "New" → "Database" → "Add PostgreSQL"
  
  步骤 4: Railway 会自动:
          - 创建 PostgreSQL 数据库
          - 设置 DATABASE_URL 环境变量
          - 重新部署项目
  
  步骤 5: 等待重新部署完成后，运行:
          curl https://wlj-production.up.railway.app/api/health
          如果返回 "db": "postgresql" 则配置成功
  
  步骤 6: 同步数据到 PostgreSQL:
          node scripts/sync-to-remote.js
  `);
  
  console.log('='.repeat(60));
  console.log('💡 提示: Railway PostgreSQL 是免费的，包含在免费额度内');
  console.log('='.repeat(60));
}

main().catch(console.error);
