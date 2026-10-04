#!/usr/bin/env node
/**
 * WLJ 数据库连通性 + 服务状态体检（在服务器上直接跑，不需要编译）
 *
 * 用法：
 *   cd /opt/wlj
 *   node scripts/db-doctor.js
 *
 * 它回答三个问题（顺序就是从最可能的病根往下排）：
 *   1. 这台服务器自己能连上数据库吗？（区分「应用 env 问题」和「网络/防火墙问题」）
 *   2. 如果按配置的主机连不上，那换成 127.0.0.1 / 本机网卡地址能不能连上？（能 → 改 DATABASE_URL 即可止血）
 *   3. 服务是不是真的在反复重启？数据库侧有没有堆着一堆没人用的连接？
 *
 * 只读：只做 TCP connect + SELECT 1 + 读取状态，不写任何业务数据。
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const TIMEOUT_MS = 4000;

// ---------------- 小工具 ----------------

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return null;
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  if (env.DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
  return env;
}

/** 连接串打码，别把密码打出来 */
function mask(url) {
  if (!url) return '(未设置)';
  return String(url).replace(/(:\/\/[^:/@]+:)[^@]*@/, '$1***@');
}

function parseTarget(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port || 5432), database: u.pathname.replace(/^\//, '') };
  } catch {
    return null;
  }
}

function tcpProbe(host, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ host, port, ms: Date.now() - started, ...result });
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, error: 'TIMEOUT（数据包被丢，通常是防火墙/安全组 DROP）' }));
    socket.once('error', (err) => finish({ ok: false, error: `${err.code || 'ERROR'}（${err.message}）` }));
  });
}

/** 把连接串的主机换掉，密码用占位符，方便直接粘贴（不打印真密码） */
function withHost(url, host, port) {
  try {
    const u = new URL(url);
    u.hostname = host;
    if (port) u.port = String(port);
    return u.toString().replace(/(:\/\/[^:/@]+:)[^@]*@/, '$1<原密码>@');
  } catch {
    return `postgresql://postgres:<原密码>@${host}:${port || 5432}/postgres`;
  }
}

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim();
  } catch {
    return '';
  }
}

function line(label) {
  console.log(`\n${label}`);
}

// ---------------- 体检主流程 ----------------

(async () => {
  const startedAt = new Date().toISOString();
  console.log('='.repeat(72));
  console.log(' WLJ 体检：数据库连通性 + 服务状态');
  console.log(` 时间 ${startedAt}   主机 ${os.hostname()}   目录 ${process.cwd()}`);
  console.log('='.repeat(72));

  // ---------- 1. 环境变量 ----------
  line('[1] 环境变量');
  const envFile = loadEnvLocal();
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const target = parseTarget(url);
  console.log(`  DATABASE_URL   : ${mask(url)}`);
  console.log(`  .env.local     : ${envFile ? '存在' : '不存在'}`);
  if (envFile && envFile.DATABASE_URL && envFile.DATABASE_URL !== process.env.DATABASE_URL) {
    console.log(`  ⚠️ .env.local 里的 DATABASE_URL 与环境变量不同：${mask(envFile.DATABASE_URL)}`);
  }
  if (!target) {
    console.log('  ❌ 无法解析 DATABASE_URL（未配置或格式不对）');
  } else {
    console.log(`  连接目标       : ${target.host}:${target.port}/${target.database}`);
    console.log(`  PGSSLMODE      : ${process.env.PGSSLMODE || '(未设置 → 使用 TLS)'}`);
  }
  console.log(`  node           : ${process.version}`);

  // ---------- 2. TCP 连通性 ----------
  line('[2] TCP 连通性（只做 connect，不发任何协议数据）');
  const candidates = [];
  if (target) candidates.push({ host: target.host, port: target.port, tag: '配置里的主机' });
  const port = target ? target.port : 5432;
  candidates.push({ host: '127.0.0.1', port, tag: '本机回环（推荐兜底）' });
  for (const [, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push({ host: a.address, port, tag: '本机网卡' });
    }
  }
  const tcpResults = [];
  for (const c of candidates) {
    const r = await tcpProbe(c.host, c.port);
    tcpResults.push({ ...r, tag: c.tag });
    const status = r.ok ? `✅ 成功 (${r.ms}ms)` : `❌ ${r.error}`;
    console.log(`  ${(`${c.host}:${c.port}`).padEnd(24)} ${status}   ${c.tag}`);
  }

  // ---------- 3. 用应用同样的参数跑 SELECT 1 ----------
  line('[3] 用 PostgreSQL 驱动按应用的参数执行 SELECT 1');
  let pgOk = false;
  let pgError = '';
  let pgServerInfo = null;
  try {
    const { Client } = require('pg');
    const useSsl = (process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase() !== 'disable';
    const client = new Client({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      application_name: 'wlj-db-doctor',
    });
    await client.connect();
    const r = await client.query(`select 1 as ok, version() as version, inet_server_addr()::text as server_addr,
        inet_server_port() as server_port, current_user as user, current_database() as db`);
    pgOk = true;
    pgServerInfo = r.rows[0];
    console.log(`  ✅ 连接成功：server=${pgServerInfo.server_addr}:${pgServerInfo.server_port} user=${pgServerInfo.user} db=${pgServerInfo.db}`);
    console.log(`  ✅ ${pgServerInfo.version.split(',')[0]}`);

    const r2 = await client.query(`select
        (select setting from pg_settings where name='max_connections') as max_connections,
        (select setting from pg_settings where name='idle_session_timeout') as idle_session_timeout,
        (select setting from pg_settings where name='tcp_keepalives_idle') as tcp_keepalives_idle,
        (select count(*) from pg_stat_activity) as total_conn,
        (select count(*) from pg_stat_activity where application_name like 'wlj%') as app_conn,
        extract(epoch from (now() - pg_postmaster_start_time()))::int as pg_uptime_sec`);
    console.log(`  连接上限 ${r2.rows[0].max_connections} ｜ 当前总连接 ${r2.rows[0].total_conn}（其中本应用 ${r2.rows[0].app_conn}）｜ PG 已运行 ${r2.rows[0].pg_uptime_sec}s`);
    console.log(`  idle_session_timeout=${r2.rows[0].idle_session_timeout}  tcp_keepalives_idle=${r2.rows[0].tcp_keepalives_idle}`);

    const r3 = await client.query(`select coalesce(application_name,'(空)') as application_name, client_addr::text as client_addr,
        state, count(*)::int as n from pg_stat_activity
        where backend_type = 'client backend'
        group by 1,2,3 order by 4 desc limit 10`);
    if (r3.rows.length) {
      console.log('  当前连接明细（application_name / 来源 / 状态 / 条数）：');
      for (const row of r3.rows) {
        console.log(`    ${String(row.application_name).padEnd(28)} ${String(row.client_addr).padEnd(22)} ${String(row.state).padEnd(10)} ${row.n}`);
      }
    }
    await client.end();
  } catch (err) {
    pgError = `${err.code || 'UNKNOWN'}: ${err.message}`;
    console.log(`  ❌ 连接失败：${pgError}`);
  }

  // ---------- 4. 本机 5432 socket 状态 ----------
  line('[4] 本机 5432 相关 socket 状态（看有没有堆着 CLOSE_WAIT / 残留连接）');
  const ssOut =
    sh(`ss -tan 2>/dev/null | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn`) ||
    sh(`netstat -an 2>/dev/null | awk '/tcp/ {print $6}' | sort | uniq -c | sort -rn | head -10`);
  if (ssOut) {
    console.log(ssOut.split('\n').map((l) => '  ' + l).join('\n'));
  } else {
    console.log('  (没有 ss / netstat 可用，跳过)');
  }
  const dport = sh(`ss -tan 2>/dev/null | grep -c ':5432'`) || sh(`netstat -an 2>/dev/null | grep -c '5432'`);
  if (dport) console.log(`  其中 5432 端口相关：${dport} 条`);

  // ---------- 5. pm2 / systemd 状态 ----------
  line('[5] 服务进程状态（判断是不是在反复重启）');
  const pm2Json = sh('pm2 jlist 2>/dev/null');
  if (pm2Json) {
    try {
      const list = JSON.parse(pm2Json);
      for (const p of list) {
        console.log(
          `  ${p.name}：pid=${p.pid} 状态=${p.pm2_env && p.pm2_env.status} 重启次数=${p.pm2_env && p.pm2_env.restart_time}` +
            ` 不稳定重启=${p.pm2_env && (p.pm2_env.unstable_restarts || 0)}` +
            ` 内存=${p.monit ? Math.round(p.monit.memory / 1024 / 1024) + 'MB' : '?'}` +
            ` 内存上限=${(p.pm2_env && p.pm2_env.max_memory_restart) || '(未设置)'}` +
            ` uptime=${p.pm2_env && p.pm2_env.pm_uptime ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) + 's' : '?'}`
        );
      }
      console.log('  （重启次数一直在涨就说明还在崩；不稳定重启多通常是启动即崩）');
    } catch (e) {
      console.log('  pm2 输出解析失败:', e.message);
    }
  } else {
    const systemdOut = sh('systemctl is-active wlj 2>/dev/null');
    console.log(systemdOut ? `  systemctl wlj: ${systemdOut}` : '  (没检测到 pm2 或 systemd 的 wlj 服务)');
  }

  // ---------- 6. 结论 ----------
  line('== 结论 ==');
  if (pgOk) {
    console.log('  ✅ 这台服务器能连上数据库（应用同样的参数）。');
    console.log('     如果登录接口仍然报错，请对比 pm2 环境里的 DATABASE_URL 是否与本次一致：');
    console.log('       pm2 describe wlj | grep -i DATABASE_URL');
    console.log('     然后 npm run build && pm2 restart wlj。');
  } else {
    const loopback = tcpResults.find((r) => r.host === '127.0.0.1');
    console.log(`  ❌ 连不上数据库：${pgError || '(TCP 未通)'}`);
    if (loopback && loopback.ok) {
      console.log('  ✅ 但 127.0.0.1:5432 是通的 → 这是「配置的主机走不通」而不是数据库的问题。');
      console.log('     最快的止血办法：把 DATABASE_URL 的主机改成 127.0.0.1（数据库就在本机）：');
      console.log(`       DATABASE_URL="${withHost(url, '127.0.0.1', target ? target.port : 5432)}"`);
      console.log('     改完执行：');
      console.log('       npm run build && pm2 restart wlj   # 或 systemctl restart wlj');
    } else {
      console.log('  ❌ 连 127.0.0.1:5432 也不通 → 按顺序查：');
      console.log('       systemctl status postgresql');
      console.log('       sudo ss -tlnp | grep 5432');
      console.log('       sudo tail -50 /var/log/postgresql/postgresql-14-main.log');
      console.log('       df -h; free -m');
    }
    console.log('  另外确认安全组/防火墙放行了本机到 5432 的出方向（回环 NAT 常被忽略）。');
  }
  console.log('');
})().catch((err) => {
  console.error('体检脚本异常：', err);
  process.exit(1);
});
