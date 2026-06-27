import { NextRequest, NextResponse } from 'next/server';

/**
 * 微信小程序评估数据同步 API
 * 
 * POST /api/weapp-sync
 * 接收小程序端评估记录，保存到本地数据库
 * 
 * GET /api/weapp-sync
 * 查询同步状态/历史
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');

/**
 * 将小程序评估报告转换为 student_scale_records 格式
 */
function convertReport(report: any) {
  const { scaleId, formData, answers, createTime } = report;

  const scaleMap: Record<string, { name: string; category: string }> = {
    'sensory': { name: '感觉统合评估', category: '感统' },
    'tml1': { name: '症状与学习成绩评估表', category: '行为' },
    'tml2': { name: '注意力缺陷-多动障碍(ADHD)评估量表', category: '注意力' },
    'tml3': { name: '社交反应量表 (SRS)', category: '社交' },
  };

  const scaleInfo = scaleMap[scaleId] || { name: '未知量表', category: '其他' };
  const studentName = formData?.name || '未知';
  const evaluator = formData?.evaluator || '';

  let scores: { fieldId: string; fieldLabel: string; value: string | number; remark?: string }[] = [];

  if (scaleId === 'sensory') {
    // 感统评估的维度得分
    const dimensions: { id: string; name: string }[] = [
      { id: 'vestibular', name: '前庭觉' },
      { id: 'tactile', name: '触觉' },
      { id: 'proprioceptive', name: '本体觉' },
      { id: 'visual', name: '视觉' },
      { id: 'auditory', name: '听觉' },
      { id: 'olfactory', name: '嗅觉/味觉' },
    ];
    const scoreLevels = [
      { value: 1, label: '严重失调' },
      { value: 2, label: '中度失调' },
      { value: 3, label: '轻度失调' },
      { value: 4, label: '正常' },
      { value: 5, label: '良好' },
    ];
    scores = dimensions.map(dim => {
      const score = report.scores?.[dim.id] ?? 3;
      const level = scoreLevels.find(l => l.value === Math.floor(score)) || scoreLevels[2];
      return { fieldId: dim.id, fieldLabel: dim.name, value: score, remark: level.label };
    });
  } else {
    // TML 量表
    if (answers && typeof answers === 'object') {
      for (const [qId, val] of Object.entries(answers)) {
        if (qId.startsWith(`${scaleId}_`)) {
          const numStr = qId.replace(`${scaleId}_`, '');
          scores.push({
            fieldId: qId,
            fieldLabel: `第${numStr}题`,
            value: val as number,
          });
        }
      }
    }
  }

  const age = formData?.age ? parseInt(formData.age) || 0 : 0;
  const grade = formData?.grade || '';

  return {
    studentName,
    scaleName: scaleInfo.name,
    category: scaleInfo.category,
    evaluator,
    evaluationDate: createTime ? createTime.split('T')[0] : new Date().toISOString().split('T')[0],
    scores,
    summary: report.overallAdvice || `总分：${report.totalScore || 'N/A'}`,
    recommendations: report.overallAdvice || '',
    status: 'completed' as const,
    source: 'weapp_sensory',
    rawReportId: report.id,
    rawData: JSON.stringify(report),
    age,
    grade,
    gender: formData?.gender || '',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reports } = body;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return NextResponse.json(
        { error: '缺少评估报告数据，请提供 reports 数组' },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (const report of reports) {
      try {
        const record = convertReport(report);
        
        // 调用本地 Express 后端保存
        const serverUrl = `${API_BASE}/api/student-scale-records`;
        const saveRes = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });

        if (saveRes.ok) {
          const saved = await saveRes.json();
          results.push({ id: report.id, savedId: saved._id || saved.id, success: true });
        } else {
          const errText = await saveRes.text();
          errors.push({ id: report.id, error: `保存失败: ${errText}` });
        }
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
    return NextResponse.json(
      { error: `请求处理失败: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    name: '微信小程序数据同步 API',
    version: '1.0.0',
    description: '接收微信小程序感觉统合评估数据，同步到 WLJ 数据库',
    usage: {
      POST: {
        url: '/api/weapp-sync',
        body: {
          reports: '评估报告数组（从微信小程序端获取）',
        },
      },
    },
  });
}
