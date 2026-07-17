'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

// ==================== 类型定义 ====================
interface PatientInfo {
  name: string;
  age: string;
  birthday: string;
  phone: string;
}

interface Question {
  id: number;
  text: string;
}

interface Factor {
  factor_name: string;
  question_ids: number[];
  rules: { level: string; min: number; max: number; description: string }[];
}

interface EvaluationData {
  scale_info: {
    title: string;
    institution: string;
    instructions: string;
    patient_fields: { field: string; label: string; type: string }[];
    options: { value: number; label: string }[];
  };
  questions: Question[];
  evaluation_schema: {
    factors: Factor[];
  };
}

interface FactorResult {
  factorName: string;
  totalScore: number;
  maxScore: number;
  level: string;
  description: string;
  percentage: number;
}

// ==================== 页面组件 ====================
export default function EvaluationPage() {
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<PatientInfo>({ name: '', age: '', birthday: '', phone: '' });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<FactorResult[]>([]);
  const [analysis, setAnalysis] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  // 加载 JSON 数据
  useEffect(() => {
    fetch('/儿童感觉统合检查表.json')
      .then(res => res.json())
      .then((data: EvaluationData) => {
        setEvalData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('加载评估数据失败:', err);
        setLoading(false);
      });
  }, []);

  // 处理姓名输入
  const handlePatientChange = (field: keyof PatientInfo, value: string) => {
    setPatient(prev => ({ ...prev, [field]: value }));
  };

  // 处理答题
  const handleAnswer = (qid: number, score: number) => {
    setAnswers(prev => ({ ...prev, [qid]: score }));
  };

  // 计算得分
  const calculateResults = useCallback((): FactorResult[] => {
    if (!evalData) return [];
    const factors = evalData.evaluation_schema.factors;
    return factors.map(factor => {
      const ids = factor.question_ids;
      let totalScore = 0;
      ids.forEach(id => {
        totalScore += answers[id] || 1; // 未答题默认1分
      });
      const maxScore = ids.length * 5;

      // 匹配等级
      let matched = factor.rules.find(r => totalScore >= r.min && totalScore <= r.max);
      if (!matched) {
        // 如果分数超出范围，取最近的值
        const sorted = [...factor.rules].sort((a, b) => Math.abs(a.min - totalScore) - Math.abs(b.min - totalScore));
        matched = sorted[0];
      }

      // 计算百分比（越高越严重）
      const maxPossible = factor.rules[factor.rules.length - 1].max;
      const minPossible = factor.rules[0].min;
      const percentage = Math.round(((totalScore - minPossible) / (maxPossible - minPossible)) * 100);

      return {
        factorName: factor.factor_name,
        totalScore,
        maxScore,
        level: matched.level,
        description: matched.description,
        percentage: Math.max(0, Math.min(100, percentage)),
      };
    });
  }, [evalData, answers]);

  // 提交
  const handleSubmit = () => {
    if (!patient.name.trim()) {
      alert('请输入姓名');
      return;
    }
    const answeredCount = Object.keys(answers).length;
    if (evalData && answeredCount < evalData.questions.length) {
      if (!confirm(`已回答 ${answeredCount}/${evalData.questions.length} 题，未答题将按1分计。确定提交吗？`)) {
        return;
      }
    }
    const res = calculateResults();
    setResults(res);
    setSubmitted(true);
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 重置
  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
    setResults([]);
    setAnalysis('');
    setSuggestions('');
  };

  // 已答题数
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = evalData?.questions.length || 0;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-400 text-lg">加载评估数据...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!evalData) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-red-500 text-lg">加载评估数据失败</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* 标题 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h1 className="text-2xl font-bold text-gray-800">{evalData.scale_info.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{evalData.scale_info.institution}</p>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">{evalData.scale_info.instructions}</p>
            </div>

            {/* 基本信息 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4 border-l-4 border-primary-500 pl-3">基本信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {evalData.scale_info.patient_fields.map(field => (
                  <div key={field.field}>
                    <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                    <input
                      type={field.type === 'date' ? 'date' : 'text'}
                      value={patient[field.field as keyof PatientInfo] || ''}
                      onChange={e => handlePatientChange(field.field as keyof PatientInfo, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none bg-white"
                      placeholder={`请输入${field.label}`}
                      disabled={submitted}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 进度条 */}
            {!submitted && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">答题进度</span>
                  <span className="text-sm font-medium text-primary-600">{answeredCount}/{totalQuestions}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* 答题卡 - 平铺所有题目 */}
            {!submitted && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4 border-l-4 border-primary-500 pl-3">评估问答</h2>
                <div className="space-y-3">
                  {evalData.questions.map((q, idx) => (
                    <div key={q.id} className="p-4 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors">
                      <div className="flex items-start gap-3 mb-2">
                        <span className="text-xs font-bold text-gray-400 mt-0.5 shrink-0 w-6">#{q.id}</span>
                        <p className="text-sm text-gray-700 leading-relaxed">{q.text}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-9">
                        {evalData.scale_info.options.map(opt => {
                          const isSelected = answers[q.id] === opt.value;
                          const colors = ['bg-green-100 text-green-800 border-green-300', 'bg-blue-100 text-blue-800 border-blue-300', 'bg-yellow-100 text-yellow-800 border-yellow-300', 'bg-orange-100 text-orange-800 border-orange-300', 'bg-red-100 text-red-800 border-red-300'];
                          return (
                            <button
                              key={opt.value}
                              onClick={() => handleAnswer(q.id, opt.value)}
                              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                                isSelected ? `${colors[opt.value - 1]} ring-2 ring-offset-1 ring-${['green','blue','yellow','orange','red'][opt.value - 1]}-400` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {opt.value} - {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 提交按钮 */}
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleSubmit}
                    className="px-10 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-base font-medium shadow-sm"
                  >
                    📊 提交评估
                  </button>
                </div>
              </div>
            )}

            {/* 评估报告 */}
            {submitted && (
              <div ref={reportRef} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">📊 评估报告</h2>
                  <div className="flex gap-2">
                    <button onClick={handleReset} className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                      🔄 重新评估
                    </button>
                    <button onClick={() => window.print()} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors">
                      🖨️ 打印报告
                    </button>
                  </div>
                </div>

                {/* 患者信息 */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">基础信息</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                    {patient.name && <div><span className="text-gray-400">姓名：</span>{patient.name}</div>}
                    {patient.age && <div><span className="text-gray-400">年龄：</span>{patient.age}</div>}
                    {patient.birthday && <div><span className="text-gray-400">生日：</span>{patient.birthday}</div>}
                    {patient.phone && <div><span className="text-gray-400">电话：</span>{patient.phone}</div>}
                  </div>
                </div>

                {/* 雷达图 */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">各维度评分雷达图</h3>
                  <RadarChart results={results} />
                </div>

                {/* 各维度详情 */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">各维度评分详情</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-4 py-2 text-gray-600 font-medium">维度</th>
                          <th className="text-center px-4 py-2 text-gray-600 font-medium">得分</th>
                          <th className="text-center px-4 py-2 text-gray-600 font-medium">等级</th>
                          <th className="text-center px-4 py-2 text-gray-600 font-medium">严重程度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, idx) => {
                          const levelColor = 
                            r.description.includes('重度') ? 'bg-red-100 text-red-700' :
                            r.description.includes('中度') ? 'bg-orange-100 text-orange-700' :
                            r.description.includes('轻度') ? 'bg-yellow-100 text-yellow-700' :
                            r.description.includes('正常') || r.description.includes('偏小') ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700';
                          const barColor =
                            r.description.includes('重度') ? 'bg-red-500' :
                            r.description.includes('中度') ? 'bg-orange-500' :
                            r.description.includes('轻度') ? 'bg-yellow-500' :
                            'bg-green-500';
                          return (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="px-4 py-3 font-medium text-gray-700">{r.factorName}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-bold text-gray-800">{r.totalScore}</span>
                                <span className="text-gray-400 text-xs">/{r.maxScore}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 text-xs rounded-full ${levelColor}`}>
                                  {r.description}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[120px]">
                                    <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${r.percentage}%` }} />
                                  </div>
                                  <span className="text-xs text-gray-400 w-8">{r.percentage}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 分析与康复建议 */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">1. 分析</h3>
                    <textarea
                      value={analysis}
                      onChange={e => setAnalysis(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none resize-y bg-white"
                      rows={4}
                      placeholder="请填写评估分析..."
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">2. 康复建议</h3>
                    <textarea
                      value={suggestions}
                      onChange={e => setSuggestions(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none resize-y bg-white"
                      rows={4}
                      placeholder="请填写康复建议..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ==================== 雷达图组件 ====================
function RadarChart({ results }: { results: FactorResult[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(400);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setSize(Math.min(w, 500));
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || results.length === 0) return;
    drawRadar(canvasRef.current, results, size);
  }, [results, size]);

  return (
    <div ref={containerRef} className="flex justify-center">
      <canvas ref={canvasRef} width={size} height={size} className="max-w-full" />
    </div>
  );
}

// 绘制雷达图
function drawRadar(canvas: HTMLCanvasElement, results: FactorResult[], size: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 50;
  const n = results.length;
  if (n < 3) return;

  // 计算每个维度的得分比例(0-1)
  const maxLevel = 5; // 5个等级: 小偏小/正常/轻度/中度/重度
  const scores = results.map(r => {
    // 根据description转换分数
    if (r.description.includes('重度')) return 1;
    if (r.description.includes('中度')) return 0.8;
    if (r.description.includes('轻度')) return 0.6;
    if (r.description.includes('正常')) return 0.4;
    return 0.2; // 偏小
  });

  // 绘制网格
  const levels = 5;
  for (let level = 1; level <= levels; level++) {
    const r = (radius / levels) * level;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 绘制轴线
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.strokeStyle = '#e8e8e8';
    ctx.stroke();
  }

  // 绘制数据区域
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = radius * scores[idx];
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(240, 128, 32, 0.15)';
  ctx.fill();
  ctx.strokeStyle = '#F08020';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 绘制数据点
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = radius * scores[i];
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#F08020';
    ctx.fill();
  }

  // 绘制标签
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const labelRadius = radius + 25;
    const x = cx + labelRadius * Math.cos(angle);
    const y = cy + labelRadius * Math.sin(angle);

    // 简写标签
    const label = results[i].factorName.length > 6 ? results[i].factorName.slice(0, 6) + '..' : results[i].factorName;
    ctx.fillStyle = '#666';
    ctx.fillText(label, x, y);
  }
}
