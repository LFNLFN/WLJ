// 初始化预设量表模板到线上数据库
// 使用方式: API_URL=https://your-domain.com/api node scripts/init-scales-remote.js

const API_BASE = process.env.API_URL || 'https://wlj-production.up.railway.app/api';

const PRESET_SCALES = [
  {
    name: '韦氏智力评估',
    category: '智力',
    description: '评估儿童的智力发展水平',
    fields: [
      { label: '语言理解', type: 'score', unit: '分' },
      { label: '知觉推理', type: 'score', unit: '分' },
      { label: '工作记忆', type: 'score', unit: '分' },
      { label: '加工速度', type: 'score', unit: '分' },
      { label: '总智商', type: 'score', unit: '分' },
    ],
  },
  {
    name: '感觉统合评估',
    category: '感统',
    description: '评估儿童的感觉统合能力',
    fields: [
      { label: '前庭觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '触觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '本体觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '视觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '听觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
    ],
  },
  {
    name: '语言能力评估',
    category: '语言',
    description: '评估儿童的语言理解和表达能力',
    fields: [
      { label: '语言理解', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '语言表达', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '语音清晰度', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '词汇量', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '社交语言', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '注意力评估',
    category: '注意力',
    description: '评估儿童的注意力水平',
    fields: [
      { label: '持续注意力', type: 'score', unit: '分' },
      { label: '选择性注意力', type: 'score', unit: '分' },
      { label: '分配性注意力', type: 'score', unit: '分' },
      { label: '冲动控制', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '社交能力评估',
    category: '社交',
    description: '评估儿童的社交互动能力',
    fields: [
      { label: '目光对视', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '社交主动性', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '合作能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪理解', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '游戏互动', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '儿童行为评估',
    category: '行为',
    description: '评估儿童的行为表现',
    fields: [
      { label: '多动行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '冲动行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '刻板行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '自伤行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '攻击行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
    ],
  },
  {
    name: '情绪发展评估',
    category: '情绪',
    description: '评估儿童的情绪发展状况',
    fields: [
      { label: '情绪识别', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪表达', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪调节', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪理解', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '共情能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '智力发育筛查',
    category: '智力',
    description: '快速筛查儿童的智力发育水平',
    fields: [
      { label: '大运动', type: 'select', options: ['正常', '边缘', '异常'] },
      { label: '精细动作', type: 'select', options: ['正常', '边缘', '异常'] },
      { label: '适应能力', type: 'select', options: ['正常', '边缘', '异常'] },
      { label: '语言能力', type: 'select', options: ['正常', '边缘', '异常'] },
      { label: '社交行为', type: 'select', options: ['正常', '边缘', '异常'] },
    ],
  },
  {
    name: '自闭症行为筛查',
    category: '行为',
    description: '评估儿童的自闭症相关行为特征',
    fields: [
      { label: '社交互动', type: 'score', unit: '分' },
      { label: '沟通能力', type: 'score', unit: '分' },
      { label: '刻板行为', type: 'score', unit: '分' },
      { label: '感知异常', type: 'score', unit: '分' },
      { label: '发展水平', type: 'score', unit: '分' },
    ],
  },
  {
    name: '粗大动作评估',
    category: '感统',
    description: '评估儿童的大肌肉群运动能力',
    fields: [
      { label: '平衡能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '协调能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '力量', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '耐力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '敏捷性', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '精细动作评估',
    category: '感统',
    description: '评估儿童的手部小肌肉群运动能力',
    fields: [
      { label: '抓握能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '手眼协调', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '双手配合', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '书写能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '操作速度', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '心理健康评估',
    category: '情绪',
    description: '评估儿童的心理健康状况',
    fields: [
      { label: '焦虑水平', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '抑郁倾向', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '自尊水平', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '适应能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '睡眠状况', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
];

async function initScales() {
  console.log('🚀 开始初始化预设量表模板...\n');
  console.log(`📡 API 地址: ${API_BASE}\n`);

  // 获取已有量表
  let existingNames = [];
  try {
    const res = await fetch(`${API_BASE}/scale-templates`);
    const existing = await res.json();
    existingNames = existing.map((s) => s.name);
    console.log(`📋 已有 ${existing.length} 个量表: ${existingNames.join(', ')}`);
  } catch (err) {
    console.log('⚠️  获取已有量表失败');
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const scale of PRESET_SCALES) {
    if (existingNames.includes(scale.name)) {
      console.log(`⏭️  [${success + failed + skipped + 1}/${PRESET_SCALES.length}] ${scale.name} 已存在, 跳过`);
      skipped++;
      continue;
    }

    const payload = {
      name: scale.name,
      category: scale.category,
      description: scale.description,
      fields: scale.fields.map((f, i) => ({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        label: f.label,
        type: f.type,
        options: f.options || [],
        unit: f.unit || '',
        sortOrder: i,
      })),
    };

    try {
      const res = await fetch(`${API_BASE}/scale-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        console.log(`✅ [${success + failed + skipped + 1}/${PRESET_SCALES.length}] ${scale.name} (${scale.category})`);
        success++;
      } else {
        const err = await res.text();
        console.log(`❌ [${success + failed + skipped + 1}/${PRESET_SCALES.length}] ${scale.name}: ${err}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ [${success + failed + skipped + 1}/${PRESET_SCALES.length}] ${scale.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 完成！新增: ${success}, 跳过: ${skipped}, 失败: ${failed}`);
}

initScales().catch(console.error);
