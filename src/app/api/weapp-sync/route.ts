import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/api/crud';

// ==================== 量表定义（与小程序一致） ====================

const scaleMap: Record<string, { name: string; category: string }> = {
  'sensory': { name: '儿童感觉统合检查表', category: '感统' },
  'sensory-4-5': { name: '未来家感统系统发展评定量表 (4-5.5岁)', category: '感统' },
  'attention': { name: '未来家6-12岁注意力水平测评体系', category: '注意力' },
  'attention-4-6': { name: '未来家儿童注意力水平测评体系 (4-6岁)', category: '注意力' },
  'attention-eval': { name: '未来家注意力感统发展评定量表 (5.5-8岁)', category: '注意力' },
  'autism': { name: '自闭症儿童心理教育评核（第三版）', category: '行为' },
  'tml1': { name: '症状与学习成绩评估表', category: '行为' },
  'tml2': { name: '注意力缺陷-多动障碍(ADHD)评估量表', category: '注意力' },
  'tml3': { name: '社交反应量表 (SRS)', category: '社交' },
};

// 8维度感统评估（与小程序完全一致）
const dimensions: { id: string; name: string }[] = [
  { id: '前庭平衡和大脑双侧分化', name: '前庭平衡和大脑双侧分化' },
  { id: '脑神经生理抑制状态', name: '脑神经生理抑制状态' },
  { id: '触觉防御和脾气敏感状况', name: '触觉防御和脾气敏感状况' },
  { id: '发育期运动和日常操作运用', name: '发育期运动和日常操作运用' },
  { id: '空间形态与视知觉', name: '空间形态与视知觉' },
  { id: '本体感 (重力不安全)', name: '本体感 (重力不安全)' },
  { id: '学习、情绪与自我形象', name: '学习、情绪与自我形象' },
  { id: '心理承受压力及行为表现', name: '心理承受压力及行为表现' },
];

// 分值等级（小程序：5=重度~1=偏小）
const levelMap: Record<number, string> = {
  5: '重度失调', 4: '中度失调', 3: '轻度失调', 2: '正常', 1: '偏小'
};

function convertReport(report: any) {
  const { scaleId, formData, answers, createTime } = report;
  const scaleInfo = scaleMap[scaleId] || { name: '未知量表', category: '其他' };
  const studentName = formData?.name || '未知';
  const evaluator = formData?.evaluator || '';

  let scoresArr: { fieldId: string; fieldLabel: string; value: string | number; remark?: string }[] = [];
  let summary = '';
  let recommendations = '';

  if (scaleId === 'sensory') {
    // 感觉统合检查表：优先用 results 数组，其次用 scores 对象
    const results = report.results || [];
    if (results.length >= 8) {
      // 小程序新版8维度 results 格式
      scoresArr = results.map((r: any, idx: number) => ({
        fieldId: r.factorName || `dim_${idx}`,
        fieldLabel: r.factorName || `维度${idx + 1}`,
        value: r.avgScore ?? 0,
        remark: r.level || r.description || '',
      }));
      summary = `综合评分：${report.overallScore ?? report.overallLevel ?? '未知'}`;
    } else {
      // 通过 scores 对象匹配维度
      const reportScores = report.scores || {};
      scoresArr = dimensions.map(dim => {
        const score = reportScores[dim.id] ?? 3;
        const level = levelMap[Math.floor(score)] || '未知';
        return { fieldId: dim.id, fieldLabel: dim.name, value: score, remark: level };
      });
      summary = `综合评分：${report.overallScore ?? '未知'}`;
    }
    recommendations = report.overallAdvice || report.suggestions || '';
  } else if (['sensory-4-5', 'attention', 'attention-4-6', 'attention-eval', 'autism'].includes(scaleId)) {
    // 其他评估量表：使用 results 数组
    const results = report.results || [];
    if (results.length > 0) {
      scoresArr = results.map((r: any, idx: number) => ({
        fieldId: r.id || `item_${idx}`,
        fieldLabel: r.factorName || r.shortText || r.text || `维度${idx + 1}`,
        value: r.score !== undefined ? r.score : (r.avgScore || 0),
        remark: r.level || r.description || '',
      }));
    }
    summary = `总分：${report.totalScore ?? 0}（${report.level ?? report.severity ?? '正常'}）`;
    if (report.description) summary += ` - ${report.description}`;
    recommendations = report.overallAdvice || report.description || '';
  } else {
    // TML 量表（tml1, tml2, tml3）：从 answers 提取各题分数
    if (answers && typeof answers === 'object') {
      for (const [qId, val] of Object.entries(answers)) {
        if (qId.startsWith(`${scaleId}_`)) {
          const num = qId.replace(`${scaleId}_`, '');
          scoresArr.push({ fieldId: qId, fieldLabel: `第${num}题`, value: val as number });
        }
      }
    }
    summary = `总分：${report.totalScore ?? 'N/A'}（${report.severity ?? '正常'}）`;
    recommendations = report.overallAdvice || '';
  }

  const record = {
    studentName,
    scaleName: scaleInfo.name,
    category: scaleInfo.category,
    evaluator,
    evaluationDate: createTime ? createTime.split('T')[0] : new Date().toISOString().split('T')[0],
    scores: scoresArr,
    summary,
    recommendations,
    status: 'completed' as const,
    source: 'weapp_sensory',
    rawReportId: report.id,
    rawData: JSON.stringify(report),
    age: formData?.age ? parseInt(formData.age) || 0 : 0,
    grade: formData?.grade || '',
    gender: formData?.gender || '',
  };

  return record;
}

async function saveRecord(record: any) {
  const db = await getDb();
  
  // 确保表结构存在（CREATE TABLE IF NOT EXISTS + ALTER TABLE 兼容已存在的旧表）
    // 确保 student_scale_records 表存在并具有正确的列
  await db.query(`CREATE TABLE IF NOT EXISTS student_scale_records (
    id TEXT PRIMARY KEY,
    studentid TEXT DEFAULT '',
    studentname TEXT DEFAULT '',
    scaletemplateid TEXT DEFAULT '',
    scalename TEXT DEFAULT '',
    category TEXT DEFAULT '',
    evaluator TEXT DEFAULT '',
    evaluationdate TEXT DEFAULT '',
    scores TEXT DEFAULT '[]',
    summary TEXT DEFAULT '',
    recommendations TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    source TEXT DEFAULT '',
    rawreportid TEXT DEFAULT '',
    rawdata TEXT DEFAULT '',
    age INTEGER DEFAULT 0,
    grade TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    createdat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updatedat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  )`);
  // 尝试添加可能缺失的列（兼容旧表）
  const migrations = [
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS scalename TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS studentname TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS category TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS evaluator TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS evaluationdate TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS summary TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS recommendations TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS source TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS rawreportid TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS rawdata TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 0`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS createdat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS updatedat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`,
  ];
  for (const sql of migrations) {
    try { await db.query(sql); } catch (_) {}
  }
  const id = generateId();
  const now = new Date().toISOString();

  const fields: Record<string, any> = {
    id, studentName: record.studentName, scaleName: record.scaleName,
    category: record.category, evaluator: record.evaluator,
    evaluationDate: record.evaluationDate, scores: JSON.stringify(record.scores),
    summary: record.summary, recommendations: record.recommendations,
    status: record.status, createdAt: now, updatedAt: now,
    source: record.source, rawReportId: record.rawReportId,
    rawData: record.rawData, age: record.age, grade: record.grade,
    gender: record.gender,
  };

  const keys = Object.keys(fields);
  const cols = keys.join(',');
  const vals = keys.map((_, i) => `$${i + 1}`).join(',');
  await db.query(`INSERT INTO student_scale_records (${cols}) VALUES (${vals})`, Object.values(fields));

  return id;
}

// POST /api/weapp-sync — 支持批量 { reports: [...] }、数组、单条报告
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let reports: any[] = [];

    if (Array.isArray(body)) {
      reports = body;
    } else if (body.reports && Array.isArray(body.reports)) {
      reports = body.reports;
    } else if (body.scaleId) {
      reports = [body];
    } else {
      return NextResponse.json(
        { error: '缺少评估报告数据，请提供 reports 数组或单个报告对象' },
        { status: 400 }
      );
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const report of reports) {
      try {
        const record = convertReport(report);
        const savedId = await saveRecord(record);
        results.push({ id: report.id, savedId, success: true });
      } catch (err: any) {
        errors.push({ id: report.id, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      total: reports.length,
      synced: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `请求处理失败: ${err.message}` }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: '微信小程序评估数据同步 API',
    version: '2.0.0',
    description: '支持批量({reports:[]})、数组、单条报告三种格式',
    usage: { POST: { body: '报告对象 / { reports: [...] } / [...]' } },
  });
}
