// 线上数据库/接口状态检查助手
// 运行方式: node scripts/setup-postgresql.js
//
// 说明：本项目只有一个数据库——线上服务器上的 PostgreSQL（DATABASE_URL）。
// 本地不建库、不需要迁移工具；这个脚本只是帮你确认线上接口和后端数据库是否正常。

const API_BASE = process.env.API_URL || 'https://www.weilaijia20210101.com/api';

async function checkCurrentStatus() {
  console.log('🔍 检查线上接口与数据库状态...\n');

  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    console.log(`   数据库类型: ${data.db}`);
    console.log(`   服务状态: ${data.status}`);
    return data.db;
  } catch (e) {
    console.log(`   ❌ 无法连接线上服务: ${e.message}`);
    return null;
  }
}

function printEnvHelp() {
  console.log('\n🧪 数据库连接串（DATABASE_URL）说明\n');
  console.log('   本项目只连接线上 PostgreSQL，不要在本地新建数据库。');
  console.log('   需要的环境变量（任意一个，推荐 DATABASE_URL）:');
  console.log('   - DATABASE_URL');
  console.log('   - POSTGRES_URL');
  console.log('   格式: postgresql://user:password@host:port/database');
  console.log('');
  console.log('   本地开发：写进 .env.local（已被 git 忽略）');
  console.log('   线上服务器：写进服务器的环境变量（systemd / PM2 / shell profile）');
  console.log('   未配置时接口会直接报错（不会回退到本地库）');
}

async function verifyData() {
  console.log('\n📋 数据验证清单\n');

  const checks = [
    { path: '/students', name: '学生' },
    { path: '/teachers', name: '教师' },
  ];

  for (const check of checks) {
    try {
      const res = await fetch(`${API_BASE}${check.path}`);
      if (!res.ok) {
        console.log(`   ⚠️  ${check.name}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : (data?.data?.length ?? '?');
      console.log(`   ✅ ${check.name}: ${count} 条`);
    } catch (e) {
      console.log(`   ❌ ${check.name}: ${e.message}`);
    }
  }
}

async function main() {
  console.log('🚀 线上数据库/接口状态检查\n');
  console.log('='.repeat(60));
  console.log('📡 API 地址:', API_BASE);
  console.log('='.repeat(60));

  const currentDb = await checkCurrentStatus();

  if (currentDb === 'postgresql') {
    console.log('\n✅ 线上 PostgreSQL 正常！');
    await verifyData();
    console.log('\n💡 登录接口与其它接口同源:', `${API_BASE}/auth/login`);
    return;
  }

  console.log('\n⚠️  线上接口未返回 postgresql，请检查服务器上的 DATABASE_URL 环境变量');
  printEnvHelp();

  console.log('\n' + '='.repeat(60));
  console.log('📖 线上服务器排查步骤:');
  console.log('='.repeat(60));
  console.log(`
  步骤 1: 确认服务器环境变量里有 DATABASE_URL（指向线上 PostgreSQL）
  步骤 2: 确认没有配置成本地地址（不要用 localhost / 127.0.0.1）
  步骤 3: 重新构建并重启服务:
          npm install && npm run build && npm run start
  步骤 4: 验证:
          curl ${API_BASE}/health
          返回 "db": "postgresql" 即正常
  `);
  console.log('='.repeat(60));
}

main().catch(console.error);
