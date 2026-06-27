import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId, isPg } from '@/lib/api/crud';

const scaleMap: Record<string, { name: string; category: string }> = {
  'sensory': { name: '感觉统合评估', category: '感统' },
  'tml1': { name: '症状与学习成绩评估表', category: '行为' },
  'tml2': { name: '注意力缺陷-多动障碍(ADHD)评估量表', category: '注意力' },
  'tml3': { name: '社交反应量表 (SRS)', category: '社交' },
};

const dimensions: { id: string; name: string }[] = [
  { id: 'vestibular', name: '前庭觉' },
  { id: 'tactile', name: '触觉' },
  { id: 'proprioceptive', name: '本体觉' },
  { id: 'visual', name: '视觉' },
  { id: 'auditory', name: '听觉' },
  { id: 'olfactory', name: '嗅觉/味觉' },
];

function convertReport(report: any) {
  const { scaleId, formData, answers, createTime } = report;
  const scaleInfo = scaleMap[scaleId] || { name: '未知量表', category: '其他' };
  const studentName = formData?.name || '未知';
  const evaluator = formData?.evaluator || '';

  let scoresArr: { fieldId: string; fieldLabel: string; value: string | number; remark?: string }[] = [];

  if (scaleId === 'sensory') {
    const reportScores = report.scores || {};
    const levelMap: Record<number, string> = { 1: '严重失调', 2: '中度失调', 3: '轻度失调', 4: '正常', 5: '良好' };
    scoresArr = dimensions.map(dim => {
      const score = reportScores[dim.id] ?? 3;
      return { fieldId: dim.id, fieldLabel: dim.name, value: score, remark: levelMap[Math.floor(score)] || '未知' };
    });
  } else {
    if (answers && typeof answers === 'object') {
      for (const [qId, val] of Object.entries(answers)) {
        if (qId.startsWith(`${scaleId}_`)) {
          scoresArr.push({ fieldId: qId, fieldLabel: `第${qId.replace(`${scaleId}_`, '')}题`, value: val as number });
        }
      }
    }
  }

  const record = {
    studentName,
    scaleName: scaleInfo.name,
    category: scaleInfo.category,
    evaluator,
    evaluationDate: createTime ? createTime.split('T')[0] : new Date().toISOString().split('T')[0],
    scores: scoresArr,
    summary: report.overallAdvice || `总分：${report.totalScore || 'N/A'}`,
    recommendations: report.overallAdvice || '',
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
  const id = generateId();
  const now = new Date().toISOString();

  const fields = {
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

  if (isPg(db)) {
    const cols = keys.map(c => `"${c}"`).join(',');
    const vals = keys.map((_, i) => `$${i + 1}`).join(',');
    await db.query(`INSERT INTO student_scale_records (${cols}) VALUES (${vals})`, Object.values(fields));
  } else {
    const cols = keys.join(',');
    const ph = keys.map(() => '?').join(',');
    db.prepare(`INSERT INTO student_scale_records (${cols}) VALUES (${ph})`).run(...Object.values(fields));
  }

  return id;
}

// POST /api/weapp-sync — 支持批量 { reports: [...] } 和单个报告对象
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let reports: any[] = [];

    if (Array.isArray(body)) {
      // 直接传数组
      reports = body;
    } else if (body.reports && Array.isArray(body.reports)) {
      // 传 { reports: [...] }
      reports = body.reports;
    } else if (body.scaleId) {
      // 单个报告对象
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
    description: '支持批量({reports:[]})和单个报告对象两种格式',
    usage: {
      POST: {
        body: '单个报告对象 / { reports: [报告1, 报告2] } / [报告1, 报告2]',
      },
    },
  });
}
