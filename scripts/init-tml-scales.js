/**
 * 初始化小程序中定义的3个TML量表模板到数据库
 * 
 * 使用方式: 
 *   node scripts/init-tml-scales.js
 *   
 * 可以指定 API 地址:
 *   API_URL=http://localhost:3001/api node scripts/init-tml-scales.js
 */

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// TML1: 症状与学习成绩评估表（26题）
const TML1 = {
  name: '症状与学习成绩评估表',
  category: '行为',
  description: '评估行为症状表现与各科学习成绩。共26题，评分0-3分（无、轻度、中度、重度）。第30-47题评估行为症状，第48-51题评估学习成绩，第52-55题评估人际关系。',
  fields: [
    { number: 1, label: '第30题: 未经批准逃学' },
    { number: 2, label: '第31题: 对人残忍' },
    { number: 3, label: '第32题: 偷窃有价值的东西' },
    { number: 4, label: '第33题: 故意损毁公物或他人财产' },
    { number: 5, label: '第34题: 使用可致严重伤害的物体如棒、刀、砖、枪等' },
    { number: 6, label: '第35题: 残忍对待动物' },
    { number: 7, label: '第36题: 纵火以至造成损害' },
    { number: 8, label: '第37题: 擅自闯入他人的房屋、商店、汽车' },
    { number: 9, label: '第38题: 未免许而夜归' },
    { number: 10, label: '第39题: 半夜离家出走' },
    { number: 11, label: '第40题: 强迫他人进行性活动' },
    { number: 12, label: '第41题: 恐慌，焦虑，或担心' },
    { number: 13, label: '第42题: 因害怕而不敢尝试新事物' },
    { number: 14, label: '第43题: 自觉无用或自卑' },
    { number: 15, label: '第44题: 自责，内疚' },
    { number: 16, label: '第45题: 感到孤独，不受欢迎，不被别人喜欢' },
    { number: 17, label: '第46题: 伤心，难过，抑郁' },
    { number: 18, label: '第47题: 多愁善感' },
    { number: 19, label: '第48题: 总体成绩(如:总评)' },
    { number: 20, label: '第49题: 语文成绩' },
    { number: 21, label: '第50题: 数学成绩' },
    { number: 22, label: '第51题: 英语成绩' },
    { number: 23, label: '第52题: 与父母关系' },
    { number: 24, label: '第53题: 与兄弟姐妹关系' },
    { number: 25, label: '第54题: 与同学关系' },
    { number: 26, label: '第55题: 与集体活动(如:团队精神)' },
  ].map(f => ({
    id: generateId(),
    label: f.label,
    type: 'select',
    options: ['无', '轻度', '中度', '重度'],
    sortOrder: f.number,
  })),
};

// TML2: ADHD评估量表（28题）
const TML2 = {
  name: '注意力缺陷-多动障碍(ADHD)评估量表',
  category: '注意力',
  description: '评估ADHD相关症状表现，共28题。评分0-3分（从不、偶尔、经常、频繁）。第1-9题评估注意力缺陷，第10-18题评估多动冲动，第19-28题评估对立违抗。',
  fields: [
    { number: 1, label: '第1题: 不能仔细留意细节或常发生粗心大意所致的错误' },
    { number: 2, label: '第2题: 在学习工作或活动时，注意力难以持久' },
    { number: 3, label: '第3题: 与人对话时，心不在焉，似乎未听见' },
    { number: 4, label: '第4题: 不听从指令而难以完成各项工作和任务' },
    { number: 5, label: '第5题: 难以完成组织各项工作和活动' },
    { number: 6, label: '第6题: 逃避、不喜欢或不愿参加那些需要精力持久的工作或活动' },
    { number: 7, label: '第7题: 遗失作业或活动所需的东西，如玩具、作业本、铅笔或课本' },
    { number: 8, label: '第8题: 易因声音或其他外界刺激而分心' },
    { number: 9, label: '第9题: 遗忘日常活动' },
    { number: 10, label: '第10题: 手或足有很多小动作或在座位扭动' },
    { number: 11, label: '第11题: 在要求安坐的场合擅自离开座位' },
    { number: 12, label: '第12题: 在要求坐好的场合跑去或爬上爬下' },
    { number: 13, label: '第13题: 不能安静地参加游戏或活动' },
    { number: 14, label: '第14题: 似被发动机驱动地一刻不停地活动' },
    { number: 15, label: '第15题: 讲话过多' },
    { number: 16, label: '第16题: 在他人问题还没问完时就急于回答' },
    { number: 17, label: '第17题: 难以静待轮换' },
    { number: 18, label: '第18题: 在他人交谈时插嘴或打断他人的活动' },
    { number: 19, label: '第19题: 发展气' },
    { number: 20, label: '第20题: 经常拒绝大人的要求或不听劝告' },
    { number: 21, label: '第21题: 生气或愤怒' },
    { number: 22, label: '第22题: 不同一顿或冷漠' },
    { number: 23, label: '第23题: 持强凌弱，威胁或恐吓他人' },
    { number: 24, label: '第24题: 对他人物体攻击' },
    { number: 25, label: '第25题: 为获得利益或逃避责任而说谎' },
    { number: 26, label: '第26题: 对人残忍' },
    { number: 27, label: '第27题: 偷窃有价值的东西' },
    { number: 28, label: '第28题: 故意损毁公物或他人财产' },
  ].map(f => ({
    id: generateId(),
    label: f.label,
    type: 'select',
    options: ['从不', '偶尔', '经常', '频繁'],
    sortOrder: f.number,
  })),
};

// TML3: 社交反应量表 SRS（65题）
const TML3 = {
  name: '社交反应量表 (SRS)',
  category: '社交',
  description: '评估社交互动能力与孤独症谱系特征。共65题，评分1-4分（没有、有时、经常、总是）。总分范围65-260分，≤76分正常，77-89轻微异常，90-106中等异常，≥107严重异常。',
  fields: [
    { number: 1, label: '在社交场合较难处地表现出明显孤独感' },
    { number: 2, label: '面部表情与当时说话的内容不相符' },
    { number: 3, label: '与别人互动时表现得很自信' },
    { number: 4, label: '当受到压力时表现出固定奇特的行为方式' },
    { number: 5, label: '不会意识到被别人利用' },
    { number: 6, label: '宁愿一个人待着也不愿与别人待在一起' },
    { number: 7, label: '能意识到别人的想法或感觉' },
    { number: 8, label: '行为方式独特、奇怪' },
    { number: 9, label: '粘着大人，对他们十分依赖' },
    { number: 10, label: '只能理解谈话的表面意思，不能理解其真正含义' },
    { number: 11, label: '很有自信心' },
    { number: 12, label: '能将自己传达给他的感受' },
    { number: 13, label: '不能理解别人的学业（如在交谈中不懂得轮流说话）' },
    { number: 14, label: '不能很好的与别人合作' },
    { number: 15, label: '能理解别人的话语及面部表情的意思' },
    { number: 16, label: '避免目光接触或有不正常的目光接触' },
    { number: 17, label: '能意识到事情的不公平' },
    { number: 18, label: '即使很努力，仍很难与别人做朋友' },
    { number: 19, label: '在谈话中理解别人的意思时受挫' },
    { number: 20, label: '有不同寻常的感官兴趣（如喃喃自语、旋转物体）或特别的玩耍方式' },
    { number: 21, label: '能模仿别人的动作' },
    { number: 22, label: '与同龄人能正常、恰当地玩耍' },
    { number: 23, label: '除非叫他去，否则不加入集体活动' },
    { number: 24, label: '较之其他儿童，他（她）很难接受常规的改变' },
    { number: 25, label: '不介意与别人不同步或与别人不同调' },
    { number: 26, label: '当别人伤心时能安慰别人' },
    { number: 27, label: '避免与同伴或成人开始社会交往' },
    { number: 28, label: '重复地想或重复谈论同一件事' },
    { number: 29, label: '被其他儿童认为古怪或奇特' },
    { number: 30, label: '在一个重复（很多事情同时发生）的环境中变得不高兴' },
    { number: 31, label: '他（她）一旦开始想一件事就会坚持想下去' },
    { number: 32, label: '个人卫生好' },
    { number: 33, label: '在交往时即使他（她）努力尝试礼貌，但是仍显得笨拙无礼' },
    { number: 34, label: '逃避想亲近他（她）的人' },
    { number: 35, label: '不能维持正常的交谈' },
    { number: 36, label: '与成人交流有困难' },
    { number: 37, label: '与同伴交流有困难' },
    { number: 38, label: '当别人的情绪或改变时能有恰当的反应' },
    { number: 39, label: '有不寻常的、残酷的兴趣' },
    { number: 40, label: '富有想象力，会假装（不脱离实际的）' },
    { number: 41, label: '毫无目的地在两个活动之间走动' },
    { number: 42, label: '对声音、质地或气味特别敏感' },
    { number: 43, label: '容易与抚养者分开' },
    { number: 44, label: '不能理解事件的分开关系（例如原因和结果），而同龄人可以' },
    { number: 45, label: '能注意别人看或听的地方' },
    { number: 46, label: '有过分严肃的面部表情' },
    { number: 47, label: '表现得很傻或突然大笑' },
    { number: 48, label: '有幽默感，能理解笑话' },
    { number: 49, label: '对一些任务完成得较好，但大多数任务不能完成得同样好' },
    { number: 50, label: '有重复的奇怪的行为如拍手或摇晃' },
    { number: 51, label: '不能直接回答问题且答非所问' },
    { number: 52, label: '会觉得他（她）正在大声地说话或制造了噪音' },
    { number: 53, label: '不能理解别人的语调与人谈话（例如像机器人说话或像在演讲）' },
    { number: 54, label: '对人的反应好像把他（她）当成物体' },
    { number: 55, label: '能意识到他（她）太靠近别人或侵犯了别人的空间' },
    { number: 56, label: '会走到两个正在谈话的人中间' },
    { number: 57, label: '经常被嘲弄' },
    { number: 58, label: '对事物的部分过于专注而忽视了整体' },
    { number: 59, label: '多疑' },
    { number: 60, label: '感情淡漠，不表达他（她）的感受' },
    { number: 61, label: '固执，要改变他（她）的想法很难' },
    { number: 62, label: '做事的原因很特别或不合逻辑' },
    { number: 63, label: '有人接触时方式特别（如碰触别人后不说话就走开）' },
    { number: 64, label: '在社交场合中特别紧张' },
    { number: 65, label: '无目的地凝视或注视' },
  ].map(f => ({
    id: generateId(),
    label: `第${f.number}题: ${f.label}`,
    type: 'select',
    options: ['没有', '有时', '经常', '总是'],
    sortOrder: f.number,
  })),
};

// 感觉统合评估（完善版）
const SENSORY_SCALE = {
  name: '感觉统合评估（小程序版）',
  category: '感统',
  description: '评估前庭觉、触觉、本体觉、视觉、听觉、嗅觉/味觉等感觉统合能力。每个维度5题，1-5分评分（严重失调-良好）。',
  fields: [
    { label: '前庭觉', desc: '平衡与空间感知能力' },
    { label: '触觉', desc: '触觉感知与防御反应' },
    { label: '本体觉', desc: '身体位置与运动感知' },
    { label: '视觉', desc: '视觉追踪与辨别能力' },
    { label: '听觉', desc: '听觉过滤与理解能力' },
    { label: '嗅觉/味觉', desc: '嗅觉与味觉敏感度' },
  ].map((f, i) => ({
    id: generateId(),
    label: f.label,
    type: 'score',
    unit: '分(1-5)',
    sortOrder: i + 1,
  })),
};

const ALL_SCALES = [SENSORY_SCALE, TML1, TML2, TML3];

async function initTMLScales() {
  console.log('🚀 开始初始化 TML 量表模板到数据库...\n');
  console.log(`📡 API 地址: ${API_BASE}\n`);

  // 获取已有量表
  let existingNames = new Set();
  try {
    const res = await fetch(`${API_BASE}/scale-templates`);
    const existing = await res.json();
    existingNames = new Set(existing.map((s: any) => s.name));
    console.log(`📋 已有 ${existing.length} 个量表模板\n`);
  } catch (err) {
    console.log('⚠️  获取已有量表失败，将重新创建所有量表\n');
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const scale of ALL_SCALES) {
    if (existingNames.has(scale.name)) {
      console.log(`⏭️  [${success + failed + skipped + 1}/${ALL_SCALES.length}] ${scale.name} (${scale.category}) - 已存在，跳过`);
      skipped++;
      continue;
    }

    try {
      const res = await fetch(`${API_BASE}/scale-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scale.name,
          category: scale.category,
          description: scale.description,
          fields: scale.fields,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`✅ [${success + failed + skipped + 1}/${ALL_SCALES.length}] ${scale.name} (${scale.category}) - ${scale.fields.length}个维度`);
        success++;
      } else {
        const err = await res.text();
        console.log(`❌ [${success + failed + skipped + 1}/${ALL_SCALES.length}] ${scale.name}: ${err}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`❌ [${success + failed + skipped + 1}/${ALL_SCALES.length}] ${scale.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 初始化完成！成功: ${success}, 跳过: ${skipped}, 失败: ${failed}, 总计: ${ALL_SCALES.length}`);
}

initTMLScales().catch(console.error);
