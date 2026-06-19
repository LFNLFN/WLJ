// 社交反应量表(SRS) - 初始化数据
const srsTemplate = {
  "name": "社交反应量表 (SRS)",
  "category": "社交",
  "description": "共65题，每题按1-4分评分，总分范围65-260分",
  "scoring": {
    "1": "没有",
    "2": "有时",
    "3": "经常",
    "4": "总是"
  },
  "scoring_values": {
    "没有": "1",
    "有时": "2",
    "经常": "3",
    "总是": "4"
  },
  "score_range": {
    "min": 65,
    "max": 260
  },
  "assessment_criteria": [
    {
      "range": "≤76分",
      "level": "正常范围",
      "description": "社交反应正常，无明显困难"
    },
    {
      "range": "77-89分",
      "level": "轻微异常",
      "description": "存在轻微的社交反应异常，需要关注和指导"
    },
    {
      "range": "90-106分",
      "level": "中等异常",
      "description": "存在中等程度的社交反应异常，建议进行干预和支持"
    },
    {
      "range": "≥107分",
      "level": "严重异常",
      "description": "存在严重的社交反应异常，需要专业评估和重点干预"
    }
  ],
  "fields": [
    {
      "id": "srs_1",
      "label": "第1题: 在社交场合较难处地表现出明显孤独感",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 1
    },
    {
      "id": "srs_2",
      "label": "第2题: 面部表情与当时说话的内容不相符",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 2
    },
    {
      "id": "srs_3",
      "label": "第3题: 与别人互动时表现得很自信",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 3
    },
    {
      "id": "srs_4",
      "label": "第4题: 当受到压力时表现出固定奇特的行为方式",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 4
    },
    {
      "id": "srs_5",
      "label": "第5题: 不会意识到被别人利用",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 5
    },
    {
      "id": "srs_6",
      "label": "第6题: 宁愿一个人待着也不愿与别人待在一起",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 6
    },
    {
      "id": "srs_7",
      "label": "第7题: 能意识到别人的想法或感觉",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 7
    },
    {
      "id": "srs_8",
      "label": "第8题: 行为方式独特、奇怪",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 8
    },
    {
      "id": "srs_9",
      "label": "第9题: 粘着大人，对他们十分依赖",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 9
    },
    {
      "id": "srs_10",
      "label": "第10题: 只能理解谈话的表面意思，不能理解其真正含义",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 10
    },
    {
      "id": "srs_11",
      "label": "第11题: 很有自信心",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 11
    },
    {
      "id": "srs_12",
      "label": "第12题: 能将自己传达给他的感受",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 12
    },
    {
      "id": "srs_13",
      "label": "第13题: 不能理解别人的学业（如在交谈中不懂得轮流说话）",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 13
    },
    {
      "id": "srs_14",
      "label": "第14题: 不能很好的与别人合作",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 14
    },
    {
      "id": "srs_15",
      "label": "第15题: 能理解别人的话语及面部表情的意思",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 15
    },
    {
      "id": "srs_16",
      "label": "第16题: 避免目光接触或有不正常的目光接触",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 16
    },
    {
      "id": "srs_17",
      "label": "第17题: 能意识到事情的不公平",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 17
    },
    {
      "id": "srs_18",
      "label": "第18题: 即使很努力，仍很难与别人做朋友",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 18
    },
    {
      "id": "srs_19",
      "label": "第19题: 在谈话中理解别人的意思时受挫",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 19
    },
    {
      "id": "srs_20",
      "label": "第20题: 有不同寻常的感官兴趣（如喃喃自语、旋转物体）或特别的玩耍方式",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 20
    },
    {
      "id": "srs_21",
      "label": "第21题: 能模仿别人的动作",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 21
    },
    {
      "id": "srs_22",
      "label": "第22题: 与同龄人能正常、恰当地玩耍",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 22
    },
    {
      "id": "srs_23",
      "label": "第23题: 除非叫他去，否则不加入集体活动",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 23
    },
    {
      "id": "srs_24",
      "label": "第24题: 较之其他儿童，他（她）很难接受常规的改变",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 24
    },
    {
      "id": "srs_25",
      "label": "第25题: 不介意与别人不同步或与别人不同调",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 25
    },
    {
      "id": "srs_26",
      "label": "第26题: 当别人伤心时能安慰别人",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 26
    },
    {
      "id": "srs_27",
      "label": "第27题: 避免与同伴或成人开始社会交往",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 27
    },
    {
      "id": "srs_28",
      "label": "第28题: 重复地想或重复谈论同一件事",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 28
    },
    {
      "id": "srs_29",
      "label": "第29题: 被其他儿童认为古怪或奇特",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 29
    },
    {
      "id": "srs_30",
      "label": "第30题: 在一个重复（很多事情同时发生）的环境中变得不高兴",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 30
    },
    {
      "id": "srs_31",
      "label": "第31题: 他（她）一旦开始想一件事就会坚持想下去",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 31
    },
    {
      "id": "srs_32",
      "label": "第32题: 个人卫生好",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 32
    },
    {
      "id": "srs_33",
      "label": "第33题: 在交往时即使他（她）努力尝试礼貌，但是仍显得笨拙无礼",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 33
    },
    {
      "id": "srs_34",
      "label": "第34题: 逃避想亲近他（她）的人",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 34
    },
    {
      "id": "srs_35",
      "label": "第35题: 不能维持正常的交谈",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 35
    },
    {
      "id": "srs_36",
      "label": "第36题: 与成人交流有困难",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 36
    },
    {
      "id": "srs_37",
      "label": "第37题: 与同伴交流有困难",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 37
    },
    {
      "id": "srs_38",
      "label": "第38题: 当别人的情绪或改变时能有恰当的反应",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 38
    },
    {
      "id": "srs_39",
      "label": "第39题: 有不寻常的、残酷的兴趣",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 39
    },
    {
      "id": "srs_40",
      "label": "第40题: 富有想象力，会假装（不脱离实际的）",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 40
    },
    {
      "id": "srs_41",
      "label": "第41题: 毫无目的地在两个活动之间走动",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 41
    },
    {
      "id": "srs_42",
      "label": "第42题: 对声音、质地或气味特别敏感",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 42
    },
    {
      "id": "srs_43",
      "label": "第43题: 容易与抚养者分开",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 43
    },
    {
      "id": "srs_44",
      "label": "第44题: 不能理解事件的分开关系（例如原因和结果），而同龄人可以",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 44
    },
    {
      "id": "srs_45",
      "label": "第45题: 能注意别人看或听的地方",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 45
    },
    {
      "id": "srs_46",
      "label": "第46题: 有过分严肃的面部表情",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 46
    },
    {
      "id": "srs_47",
      "label": "第47题: 表现得很傻或突然大笑",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 47
    },
    {
      "id": "srs_48",
      "label": "第48题: 有幽默感，能理解笑话",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 48
    },
    {
      "id": "srs_49",
      "label": "第49题: 对一些任务完成得较好，但大多数任务不能完成得同样好",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 49
    },
    {
      "id": "srs_50",
      "label": "第50题: 有重复的奇怪的行为如拍手或摇晃",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 50
    },
    {
      "id": "srs_51",
      "label": "第51题: 不能直接回答问题且答非所问",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 51
    },
    {
      "id": "srs_52",
      "label": "第52题: 会觉得他（她）正在大声地说话或制造了噪音",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 52
    },
    {
      "id": "srs_53",
      "label": "第53题: 不能理解别人的语调与人谈话（例如像机器人说话或像在演讲）",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 53
    },
    {
      "id": "srs_54",
      "label": "第54题: 对人的反应好像把他（她）当成物体",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 54
    },
    {
      "id": "srs_55",
      "label": "第55题: 能意识到他（她）太靠近别人或侵犯了别人的空间",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 55
    },
    {
      "id": "srs_56",
      "label": "第56题: 会走到两个正在谈话的人中间",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 56
    },
    {
      "id": "srs_57",
      "label": "第57题: 经常被嘲弄",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 57
    },
    {
      "id": "srs_58",
      "label": "第58题: 对事物的部分过于专注而忽视了整体",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 58
    },
    {
      "id": "srs_59",
      "label": "第59题: 多疑",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 59
    },
    {
      "id": "srs_60",
      "label": "第60题: 感情淡漠，不表达他（她）的感受",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 60
    },
    {
      "id": "srs_61",
      "label": "第61题: 固执，要改变他（她）的想法很难",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 61
    },
    {
      "id": "srs_62",
      "label": "第62题: 做事的原因很特别或不合逻辑",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 62
    },
    {
      "id": "srs_63",
      "label": "第63题: 有人接触时方式特别（如碰触别人后不说话就走开）",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 63
    },
    {
      "id": "srs_64",
      "label": "第64题: 在社交场合中特别紧张",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 64
    },
    {
      "id": "srs_65",
      "label": "第65题: 无目的地凝视或注视",
      "type": "select",
      "options": [
        "没有",
        "有时",
        "经常",
        "总是"
      ],
      "sortOrder": 65
    }
  ]
};

export default srsTemplate;
