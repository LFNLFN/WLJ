/**
 * 感觉统合评估数据同步引擎
 * 
 * 将微信小程序端的评估数据同步到 WLJ Next.js 项目数据库
 * 支持：原始感统评估 + TML1(症状与学习成绩) + TML2(ADHD) + TML3(SRS社交反应)
 */

// ==================== 量表定义（与小程序端一致） ====================

const SCALES = [
  { id: 'sensory', name: '感觉统合评估', category: '感统' },
  { id: 'tml1', name: '症状与学习成绩评估表', category: '行为' },
  { id: 'tml2', name: '注意力缺陷-多动障碍(ADHD)评估量表', category: '注意力' },
  { id: 'tml3', name: '社交反应量表 (SRS)', category: '社交' },
];

// 原始感统评估维度
const DIMENSIONS = [
  { id: 'vestibular', name: '前庭觉', icon: '🔄' },
  { id: 'tactile', name: '触觉', icon: '🤲' },
  { id: 'proprioceptive', name: '本体觉', icon: '💪' },
  { id: 'visual', name: '视觉', icon: '👁️' },
  { id: 'auditory', name: '听觉', icon: '👂' },
  { id: 'olfactory', name: '嗅觉/味觉', icon: '👃' },
];

// 评分等级
const SCORE_LEVELS = [
  { value: 1, label: '严重失调' },
  { value: 2, label: '中度失调' },
  { value: 3, label: '轻度失调' },
  { value: 4, label: '正常' },
  { value: 5, label: '良好' },
];

// TML评分选项
const TML_SCORE_OPTIONS = {
  tml1: [
    { value: 0, label: '无' },
    { value: 1, label: '轻度' },
    { value: 2, label: '中度' },
    { value: 3, label: '重度' },
  ],
  tml2: [
    { value: 0, label: '从不' },
    { value: 1, label: '偶尔' },
    { value: 2, label: '经常' },
    { value: 3, label: '频繁' },
  ],
  tml3: [
    { value: 1, label: '没有' },
    { value: 2, label: '有时' },
    { value: 3, label: '经常' },
    { value: 4, label: '总是' },
  ],
};

// ==================== 量表问题定义 ====================

const SENSORY_QUESTIONS = {
  vestibular: [
    { id: 'v1', text: '旋转后是否容易眩晕或不适', type: 'negative' },
    { id: 'v2', text: '是否喜欢摇晃、旋转等运动', type: 'positive' },
    { id: 'v3', text: '平衡能力是否较差，容易摔倒', type: 'negative' },
    { id: 'v4', text: '是否害怕高处或上下楼梯', type: 'negative' },
    { id: 'v5', text: '运动时身体协调性如何', type: 'positive' },
  ],
  tactile: [
    { id: 't1', text: '是否抗拒被触摸或拥抱', type: 'negative' },
    { id: 't2', text: '对衣物标签或特定材质是否敏感', type: 'negative' },
    { id: 't3', text: '是否喜欢触摸不同质感的物品', type: 'positive' },
    { id: 't4', text: '对温度变化是否过度敏感', type: 'negative' },
    { id: 't5', text: '洗头、剪指甲时是否抗拒', type: 'negative' },
  ],
  proprioceptive: [
    { id: 'p1', text: '动作是否笨拙，容易碰撞物品', type: 'negative' },
    { id: 'p2', text: '是否喜欢跳跃、推拉等重力的活动', type: 'positive' },
    { id: 'p3', text: '握笔力度是否过重或过轻', type: 'negative' },
    { id: 'p4', text: '模仿动作是否准确', type: 'positive' },
    { id: 'p5', text: '是否经常无意识咬东西或磨牙', type: 'negative' },
  ],
  visual: [
    { id: 'vi1', text: '是否容易迷路或找不到物品', type: 'negative' },
    { id: 'vi2', text: '拼图或搭积木能力如何', type: 'positive' },
    { id: 'vi3', text: '是否害怕强光或对光线敏感', type: 'negative' },
    { id: 'vi4', text: '眼神接触是否正常', type: 'positive' },
    { id: 'vi5', text: '是否经常眯眼或揉眼睛', type: 'negative' },
  ],
  auditory: [
    { id: 'a1', text: '对突然的响声是否过度反应', type: 'negative' },
    { id: 'a2', text: '在嘈杂环境中是否难以专注', type: 'negative' },
    { id: 'a3', text: '是否喜欢听音乐或节奏感强', type: 'positive' },
    { id: 'a4', text: '是否经常忽略别人叫他的名字', type: 'negative' },
    { id: 'a5', text: '语言理解和表达能力如何', type: 'positive' },
  ],
  olfactory: [
    { id: 'o1', text: '是否对某些气味过度敏感或排斥', type: 'negative' },
    { id: 'o2', text: '是否喜欢闻物品或人', type: 'negative' },
    { id: 'o3', text: '对食物气味是否挑剔', type: 'negative' },
    { id: 'o4', text: '是否因气味而影响食欲', type: 'negative' },
    { id: 'o5', text: '是否对气味不敏感（闻不到）', type: 'negative' },
  ],
};

const TML1_ITEMS = [
  { number: 30, text: '未经批准逃学' },
  { number: 31, text: '对人残忍' },
  { number: 32, text: '偷窃有价值的东西' },
  { number: 33, text: '故意损毁公物或他人财产' },
  { number: 34, text: '使用可致严重伤害的物体如棒、刀、砖、枪等' },
  { number: 35, text: '残忍对待动物' },
  { number: 36, text: '纵火以至造成损害' },
  { number: 37, text: '擅自闯入他人的房屋、商店、汽车' },
  { number: 38, text: '未免许而夜归' },
  { number: 39, text: '半夜离家出走' },
  { number: 40, text: '强迫他人进行性活动' },
  { number: 41, text: '恐慌，焦虑，或担心' },
  { number: 42, text: '因害怕而不敢尝试新事物' },
  { number: 43, text: '自觉无用或自卑' },
  { number: 44, text: '自责，内疚' },
  { number: 45, text: '感到孤独，不受欢迎，不被别人喜欢' },
  { number: 46, text: '伤心，难过，抑郁' },
  { number: 47, text: '多愁善感' },
  { number: 48, text: '总体成绩(如:总评)' },
  { number: 49, text: '语文成绩' },
  { number: 50, text: '数学成绩' },
  { number: 51, text: '英语成绩' },
  { number: 52, text: '与父母关系' },
  { number: 53, text: '与兄弟姐妹关系' },
  { number: 54, text: '与同学关系' },
  { number: 55, text: '与集体活动(如:团队精神)' },
];

const TML2_ITEMS = [
  { number: 1, text: '不能仔细留意细节或常发生粗心大意所致的错误' },
  { number: 2, text: '在学习工作或活动时，注意力难以持久' },
  { number: 3, text: '与人对话时，心不在焉，似乎未听见' },
  { number: 4, text: '不听从指令而难以完成各项工作和任务' },
  { number: 5, text: '难以完成组织各项工作和活动' },
  { number: 6, text: '逃避、不喜欢或不愿参加那些需要精力持久的工作或活动' },
  { number: 7, text: '遗失作业或活动所需的东西，如玩具、作业本、铅笔或课本' },
  { number: 8, text: '易因声音或其他外界刺激而分心' },
  { number: 9, text: '遗忘日常活动' },
  { number: 10, text: '手或足有很多小动作或在座位扭动' },
  { number: 11, text: '在要求安坐的场合擅自离开座位' },
  { number: 12, text: '在要求坐好的场合跑去或爬上爬下' },
  { number: 13, text: '不能安静地参加游戏或活动' },
  { number: 14, text: '似被发动机驱动地一刻不停地活动' },
  { number: 15, text: '讲话过多' },
  { number: 16, text: '在他人问题还没问完时就急于回答' },
  { number: 17, text: '难以静待轮换' },
  { number: 18, text: '在他人交谈时插嘴或打断他人的活动' },
  { number: 19, text: '发展气' },
  { number: 20, text: '经常拒绝大人的要求或不听劝告' },
  { number: 21, text: '生气或愤怒' },
  { number: 22, text: '不同一顿或冷漠' },
  { number: 23, text: '持强凌弱，威胁或恐吓他人' },
  { number: 24, text: '对他人物体攻击' },
  { number: 25, text: '为获得利益或逃避责任而说谎' },
  { number: 26, text: '对人残忍' },
  { number: 27, text: '偷窃有价值的东西' },
  { number: 28, text: '故意损毁公物或他人财产' },
];

const TML3_ITEMS = [
  { number: 1, text: '在社交场合较难处地表现出明显孤独感' },
  { number: 2, text: '面部表情与当时说话的内容不相符' },
  { number: 3, text: '与别人互动时表现得很自信' },
  { number: 4, text: '当受到压力时表现出固定奇特的行为方式' },
  { number: 5, text: '不会意识到被别人利用' },
  { number: 6, text: '宁愿一个人待着也不愿与别人待在一起' },
  { number: 7, text: '能意识到别人的想法或感觉' },
  { number: 8, text: '行为方式独特、奇怪' },
  { number: 9, text: '粘着大人，对他们十分依赖' },
  { number: 10, text: '只能理解谈话的表面意思，不能理解其真正含义' },
  { number: 11, text: '很有自信心' },
  { number: 12, text: '能将自己传达给他的感受' },
  { number: 13, text: '不能理解别人的学业（如在交谈中不懂得轮流说话）' },
  { number: 14, text: '不能很好的与别人合作' },
  { number: 15, text: '能理解别人的话语及面部表情的意思' },
  { number: 16, text: '避免目光接触或有不正常的目光接触' },
  { number: 17, text: '能意识到事情的不公平' },
  { number: 18, text: '即使很努力，仍很难与别人做朋友' },
  { number: 19, text: '在谈话中理解别人的意思时受挫' },
  { number: 20, text: '有不同寻常的感官兴趣（如喃喃自语、旋转物体）或特别的玩耍方式' },
  { number: 21, text: '能模仿别人的动作' },
  { number: 22, text: '与同龄人能正常、恰当地玩耍' },
  { number: 23, text: '除非叫他去，否则不加入集体活动' },
  { number: 24, text: '较之其他儿童，他（她）很难接受常规的改变' },
  { number: 25, text: '不介意与别人不同步或与别人不同调' },
  { number: 26, text: '当别人伤心时能安慰别人' },
  { number: 27, text: '避免与同伴或成人开始社会交往' },
  { number: 28, text: '重复地想或重复谈论同一件事' },
  { number: 29, text: '被其他儿童认为古怪或奇特' },
  { number: 30, text: '在一个重复（很多事情同时发生）的环境中变得不高兴' },
  { number: 31, text: '他（她）一旦开始想一件事就会坚持想下去' },
  { number: 32, text: '个人卫生好' },
  { number: 33, text: '在交往时即使他（她）努力尝试礼貌，但是仍显得笨拙无礼' },
  { number: 34, text: '逃避想亲近他（她）的人' },
  { number: 35, text: '不能维持正常的交谈' },
  { number: 36, text: '与成人交流有困难' },
  { number: 37, text: '与同伴交流有困难' },
  { number: 38, text: '当别人的情绪或改变时能有恰当的反应' },
  { number: 39, text: '有不寻常的、残酷的兴趣' },
  { number: 40, text: '富有想象力，会假装（不脱离实际的）' },
  { number: 41, text: '毫无目的地在两个活动之间走动' },
  { number: 42, text: '对声音、质地或气味特别敏感' },
  { number: 43, text: '容易与抚养者分开' },
  { number: 44, text: '不能理解事件的分开关系（例如原因和结果），而同龄人可以' },
  { number: 45, text: '能注意别人看或听的地方' },
  { number: 46, text: '有过分严肃的面部表情' },
  { number: 47, text: '表现得很傻或突然大笑' },
  { number: 48, text: '有幽默感，能理解笑话' },
  { number: 49, text: '对一些任务完成得较好，但大多数任务不能完成得同样好' },
  { number: 50, text: '有重复的奇怪的行为如拍手或摇晃' },
  { number: 51, text: '不能直接回答问题且答非所问' },
  { number: 52, text: '会觉得他（她）正在大声地说话或制造了噪音' },
  { number: 53, text: '不能理解别人的语调与人谈话（例如像机器人说话或像在演讲）' },
  { number: 54, text: '对人的反应好像把他（她）当成物体' },
  { number: 55, text: '能意识到他（她）太靠近别人或侵犯了别人的空间' },
  { number: 56, text: '会走到两个正在谈话的人中间' },
  { number: 57, text: '经常被嘲弄' },
  { number: 58, text: '对事物的部分过于专注而忽视了整体' },
  { number: 59, text: '多疑' },
  { number: 60, text: '感情淡漠，不表达他（她）的感受' },
  { number: 61, text: '固执，要改变他（她）的想法很难' },
  { number: 62, text: '做事的原因很特别或不合逻辑' },
  { number: 63, text: '有人接触时方式特别（如碰触别人后不说话就走开）' },
  { number: 64, text: '在社交场合中特别紧张' },
  { number: 65, text: '无目的地凝视或注视' },
];

// ==================== 评分计算（与服务端一致） ====================

function calculateDimensionScore(dimensionId, answers) {
  const questions = SENSORY_QUESTIONS[dimensionId];
  if (!questions) return 3;
  let total = 0;
  let count = 0;
  questions.forEach(q => {
    if (answers[q.id] !== undefined) {
      let score = answers[q.id];
      if (q.type === 'negative') score = 6 - score;
      total += score;
      count++;
    }
  });
  if (count === 0) return 3;
  return Math.round((total / count) * 2) / 2;
}

function calculateTMLScore(scaleId, answers) {
  const itemsMap = { tml1: TML1_ITEMS, tml2: TML2_ITEMS, tml3: TML3_ITEMS };
  const items = itemsMap[scaleId];
  if (!items) return { totalScore: 0, maxScore: 0, averageScore: 0, percentage: 0 };

  let totalScore = 0;
  let maxPossible = 0;
  const scoreMax = scaleId === 'tml3' ? 4 : 3;

  items.forEach(item => {
    const qId = `${scaleId}_${item.number}`;
    if (answers[qId] !== undefined) {
      totalScore += answers[qId];
    }
    maxPossible += scoreMax;
  });

  const averageScore = items.length > 0 ? totalScore / items.length : 0;
  const percentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;

  return {
    totalScore,
    maxScore: maxPossible,
    averageScore: Math.round(averageScore * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
  };
}

// ==================== 转换为 Next.js 项目数据格式 ====================

/**
 * 将小程序的评估报告转换为 Next.js student_scale_records 格式
 */
function convertToStudentScaleRecord(report) {
  const { scaleId, formData, answers, createTime } = report;

  const scaleInfo = SCALES.find(s => s.id === scaleId) || SCALES[0];
  const studentName = formData?.name || '未知';
  const evaluator = formData?.evaluator || '';

  let scores = [];
  let summary = '';
  let recommendations = '';

  if (scaleId === 'sensory') {
    // 感统评估：转换维度得分为 scores
    scores = DIMENSIONS.map(dim => {
      const score = report.scores?.[dim.id] || 3;
      const level = SCORE_LEVELS.find(l => l.value === Math.floor(score)) || SCORE_LEVELS[2];
      return {
        fieldId: dim.id,
        fieldLabel: dim.name,
        value: score,
        remark: level.label,
      };
    });
    summary = `综合评分：${report.overallScore}分（${report.overallLevel}）`;
    recommendations = report.overallAdvice || '';
  } else {
    // TML 量表：转换各题得分为 scores
    const itemsMap = { tml1: TML1_ITEMS, tml2: TML2_ITEMS, tml3: TML3_ITEMS };
    const items = itemsMap[scaleId] || [];
    const scoreOptions = TML_SCORE_OPTIONS[scaleId] || [];

    scores = items.map(item => {
      const qId = `${scaleId}_${item.number}`;
      const val = answers?.[qId];
      const opt = scoreOptions.find(o => o.value === val);
      return {
        fieldId: qId,
        fieldLabel: `第${item.number}题: ${item.text}`,
        value: val !== undefined ? val : '',
        remark: opt ? opt.label : '',
      };
    });

    const scoreResult = calculateTMLScore(scaleId, answers || {});
    summary = `总分：${scoreResult.totalScore}/${scoreResult.maxScore}（${scoreResult.percentage}%）`;
    if (report.severity) summary += ` - ${report.severity}`;
    recommendations = report.overallAdvice || '';
  }

  // 年龄/年级信息
  const age = formData?.age ? parseInt(formData.age) || 0 : 0;
  const grade = formData?.grade || '';

  return {
    studentName: studentName,
    scaleName: scaleInfo.name,
    category: scaleInfo.category,
    evaluator: evaluator,
    evaluationDate: createTime ? createTime.split('T')[0] : new Date().toISOString().split('T')[0],
    scores: scores,
    summary: summary,
    recommendations: recommendations,
    status: 'completed',
    // 来源标记
    source: 'weapp_sensory',
    // 原始数据
    rawReportId: report.id,
    rawData: JSON.stringify(report),
    // 附加信息
    age: age,
    grade: grade,
    gender: formData?.gender || '',
  };
}

/**
 * 获取小程序评估记录的汇总摘要文本
 */
function generateSummaryText(report) {
  const { scaleId, formData } = report;
  const name = formData?.name || '未知';
  const scaleName = SCALES.find(s => s.id === scaleId)?.name || '未知量表';

  let parts = [`${name}的${scaleName}评估报告`];

  if (scaleId === 'sensory') {
    parts.push(`综合评分：${report.overallScore}分（${report.overallLevel}）`);
  } else {
    parts.push(`总分：${report.totalScore}/${report.maxScore}（${report.percentage}%）- ${report.severity}`);
  }

  if (report.overallAdvice) {
    parts.push(`建议：${report.overallAdvice.slice(0, 50)}...`);
  }

  return parts.join(' | ');
}

module.exports = {
  SCALES,
  DIMENSIONS,
  SCORE_LEVELS,
  TML_SCORE_OPTIONS,
  SENSORY_QUESTIONS,
  TML1_ITEMS,
  TML2_ITEMS,
  TML3_ITEMS,
  calculateDimensionScore,
  calculateTMLScore,
  convertToStudentScaleRecord,
  generateSummaryText,
};
