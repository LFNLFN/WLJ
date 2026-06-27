import { NextRequest, NextResponse } from 'next/server';

/**
 * 微信小程序单条评估记录同步
 * POST /api/weapp-sync/single
 */
export async function POST(req: NextRequest) {
  try {
    const report = await req.json();
    
    if (!report || !report.scaleId) {
      return NextResponse.json(
        { error: '缺少评估报告数据' },
        { status: 400 }
      );
    }

    // 复用主路由的转换逻辑
    
    // 由于 convertReport 不是导出的，直接在这里实现转换
    const { scaleId, formData, answers, createTime, overallScore, scores, totalScore } = report;

    const scaleMap: Record<string, { name: string; category: string }> = {
      'sensory': { name: '感觉统合评估', category: '感统' },
      'tml1': { name: '症状与学习成绩评估表', category: '行为' },
      'tml2': { name: '注意力缺陷-多动障碍(ADHD)评估量表', category: '注意力' },
      'tml3': { name: '社交反应量表 (SRS)', category: '社交' },
    };

    const scaleInfo = scaleMap[scaleId] || { name: '未知量表', category: '其他' };
    const studentName = formData?.name || '未知';
    const evaluator = formData?.evaluator || '';

    let scoresArr: { fieldId: string; fieldLabel: string; value: string | number; remark?: string }[] = [];

    if (scaleId === 'sensory') {
      const dimensions: { id: string; name: string }[] = [
        { id: 'vestibular', name: '前庭觉' },
        { id: 'tactile', name: '触觉' },
        { id: 'proprioceptive', name: '本体觉' },
        { id: 'visual', name: '视觉' },
        { id: 'auditory', name: '听觉' },
        { id: 'olfactory', name: '嗅觉/味觉' },
      ];
      const reportScores = report.scores || {};
      scoresArr = dimensions.map(dim => {
        const score = reportScores[dim.id] ?? 3;
        const levelMap: Record<number, string> = { 1: '严重失调', 2: '中度失调', 3: '轻度失调', 4: '正常', 5: '良好' };
        return { fieldId: dim.id, fieldLabel: dim.name, value: score, remark: levelMap[Math.floor(score)] || '未知' };
      });
    } else {
      if (answers && typeof answers === 'object') {
        for (const [qId, val] of Object.entries(answers)) {
          if (qId.startsWith(`${scaleId}_`)) {
            const numStr = qId.replace(`${scaleId}_`, '');
            scoresArr.push({ fieldId: qId, fieldLabel: `第${numStr}题`, value: val as number });
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
      summary: report.overallAdvice || `总分：${totalScore || 'N/A'}`,
      recommendations: report.overallAdvice || '',
      status: 'completed' as const,
      source: 'weapp_sensory',
      rawReportId: report.id,
      rawData: JSON.stringify(report),
      age: formData?.age ? parseInt(formData.age) || 0 : 0,
      grade: formData?.grade || '',
      gender: formData?.gender || '',
    };

    // 保存到数据库
    const { getDb, generateId, parseRow, isPg } = await import('@/lib/api/crud');
    const db = await getDb();
    const id = generateId();
    const now = new Date().toISOString();

    // 构建字段
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

    if (isPg(db)) {
      const cols = Object.keys(fields).map(c => `"${c}"`).join(',');
      const vals = Object.keys(fields).map((_, i) => `$${i + 1}`).join(',');
      await db.query(
        `INSERT INTO student_scale_records (${cols}) VALUES (${vals})`,
        Object.values(fields)
      );
    } else {
      const cols = Object.keys(fields).join(',');
      const placeholders = Object.keys(fields).map(() => '?').join(',');
      db.prepare(`INSERT INTO student_scale_records (${cols}) VALUES (${placeholders})`).run(...Object.values(fields));
    }

    return NextResponse.json({
      success: true,
      id: record.rawReportId,
      savedId: id,
      message: '同步成功',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: '微信小程序单条数据同步',
    version: '1.0.0',
    usage: { POST: { body: '评估报告对象' } },
  });
}
