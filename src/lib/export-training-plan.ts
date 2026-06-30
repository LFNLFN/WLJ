import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { TrainingPlan, ExportConfig } from '@/lib/types';

/**
 * 基于 Excel 模板文件生成导出文件
 * 使用 template-excel 中的 xlsx 文件作为模板，只替换数据单元格
 * 保留模板的所有样式、合并单元格、列宽等格式
 */

// 从 plan 数据中根据 child name 匹配模板文件
function getTemplateFileName(plan: TrainingPlan): string {
  const name = (plan.child?.name || '').trim();
  const title = (plan.planTitle || '').trim();
  
  if (name.includes('星瑶') || name.includes('黄星瑶')) {
    return '黄星瑶感统-语言-专注力训练阶段计划.xlsx';
  }
  if (name.includes('浩轩') || name.includes('黎浩轩')) {
    return '浩轩语言训练阶段计划.xlsx';
  }
  
  return '黄星瑶感统-语言-专注力训练阶段计划.xlsx';
}

export function exportTrainingPlanToExcel(plan: TrainingPlan, config?: ExportConfig) {
  const templateFile = getTemplateFileName(plan);
  const templateUrl = `/templates/${templateFile}`;
  
  console.log('导出训练计划，使用模板:', templateFile);
  
  fetch(templateUrl)
    .then(res => {
      if (!res.ok) throw new Error(`模板文件 ${templateFile} 不存在`);
      return res.arrayBuffer();
    })
    .then(buffer => {
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      
      const jsonData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
      
      if (templateFile.includes('黄星瑶')) {
        fillHuangXingyaoTemplate(ws, jsonData, plan);
      } else if (templateFile.includes('浩轩')) {
        fillHaoXuanTemplate(ws, jsonData, plan);
      }
      
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const childName = plan.child?.name || '训练计划';
      const planTitle = plan.planTitle || '阶段计划';
      const fileName = `${childName}_${planTitle}.xlsx`;
      saveAs(blob, fileName);
    })
    .catch(err => {
      console.error('导出失败:', err);
      alert('导出失败：' + err.message);
    });
}

/** 将阶段 items 转为编号文本 */
function stageItemsToText(stage: any): string {
  if (!stage || !stage.items || !Array.isArray(stage.items)) return '';
  return stage.items
    .map((item: any, idx: number) => {
      if (typeof item === 'string') return `${idx + 1}. ${item}`;
      if (item && typeof item === 'object' && item.content) return `${idx + 1}. ${item.content}`;
      return `${idx + 1}. ${String(item)}`;
    })
    .join('\n');
}

/** 将 initialAssessment 转为编号文本 */
function assessmentToText(items: any[]): string {
  if (!items || !Array.isArray(items)) return '';
  return items
    .map((item: any, idx: number) => {
      if (typeof item === 'string') return `${idx + 1}. ${item}`;
      if (item && typeof item === 'object' && item.content) return `${idx + 1}. ${item.content}`;
      return `${idx + 1}. ${String(item)}`;
    })
    .join('\n');
}

/**
 * 填充黄星瑶模板
 * 模板有4个数据列：col2=模块名, col3=初评, col4=阶段一, col6=阶段二
 * 现在 stages 是动态数组，取前2个阶段填入阶段一/阶段二
 */
function fillHuangXingyaoTemplate(ws: XLSX.WorkSheet, jsonData: string[][], plan: TrainingPlan) {
  const modules = plan.trainingModules || [];
  
  if (plan.organization) setCell(ws, 0, 1, plan.organization);
  if (plan.planTitle) setCell(ws, 1, 2, plan.planTitle);
  
  if (plan.child) {
    const c = plan.child;
    if (c.name) setCell(ws, 3, 2, c.name);
    if (c.birthDate) setCell(ws, 3, 4, c.birthDate);
    if (c.age) setCell(ws, 3, 6, c.age);
    if (c.diagnosis) setCell(ws, 4, 2, c.diagnosis);
    if (c.cooperationLevel) setCell(ws, 4, 4, c.cooperationLevel);
    if (c.languageEnvironment) setCell(ws, 4, 6, c.languageEnvironment);
    if (c.assessmentDate) setCell(ws, 5, 2, c.assessmentDate);
    if (c.recordNumber) setCell(ws, 5, 4, c.recordNumber);
  }
  
  // 清空模块数据行
  const moduleDataCols = [2, 3, 4, 6];
  for (let r = 9; r <= 13; r++) {
    for (const c of moduleDataCols) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref]) ws[ref] = { t: 's', v: '', s: ws[ref].s };
    }
  }
  
  // 填充模块（最多4个模块）
  for (let i = 0; i < modules.length && i < 4; i++) {
    const mod = modules[i];
    const row = 9 + i;
    const stages = mod.stages || [];
    
    if (mod.moduleTitle) setCell(ws, row, 2, mod.moduleTitle);
    if (mod.initialAssessment) setCell(ws, row, 3, assessmentToText(mod.initialAssessment));
    
    // 阶段一 = stages[0]
    if (stages.length > 0) {
      setCell(ws, row, 4, stageItemsToText(stages[0]));
    }
    // 阶段二 = stages[1]
    if (stages.length > 1) {
      setCell(ws, row, 6, stageItemsToText(stages[1]));
    }
  }
  
  // 备注
  let footerText = '备注：';
  footerText += plan.notes || '阶段计划是根据孩子初期的测评结果和表现而制定，本计划和具体训练内容会随着孩子能力的提高而及时作出调整。';
  const mainTeacher = plan.signatures?.mainTeacher || '__________';
  const reviewer = plan.signatures?.reviewer || '__________';
  footerText += `\n主授课老师：${mainTeacher}    审核者：${reviewer}`;
  setCell(ws, 14, 2, footerText);
}

/**
 * 填充浩轩模板
 * 模板有4个数据列：col0=初评, col1=模块名, col2=阶段一, col4=阶段二
 */
function fillHaoXuanTemplate(ws: XLSX.WorkSheet, jsonData: string[][], plan: TrainingPlan) {
  const modules = plan.trainingModules || [];
  
  if (plan.organization) setCell(ws, 0, 0, plan.organization);
  if (plan.planTitle) setCell(ws, 1, 0, plan.planTitle);
  
  if (plan.child) {
    const c = plan.child;
    if (c.name) setCell(ws, 2, 0, `姓名：${c.name}`);
    if (c.age) setCell(ws, 2, 3, `年龄：${c.age}`);
    if (c.diagnosis) setCell(ws, 3, 0, `诊断：${c.diagnosis}`);
    if (c.cooperationLevel) setCell(ws, 3, 3, `配合程度：${c.cooperationLevel}`);
  }
  
  // 清空模块数据行
  const moduleDataCols = [0, 1, 2, 4];
  for (let r = 6; r <= 9; r++) {
    for (const c of moduleDataCols) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref]) ws[ref] = { t: 's', v: '', s: ws[ref].s };
    }
  }
  
  for (let i = 0; i < modules.length && i < 4; i++) {
    const mod = modules[i];
    const row = 6 + i;
    const stages = mod.stages || [];
    
    if (mod.moduleTitle) setCell(ws, row, 1, mod.moduleTitle);
    if (mod.initialAssessment) setCell(ws, row, 0, assessmentToText(mod.initialAssessment));
    if (stages.length > 0) setCell(ws, row, 2, stageItemsToText(stages[0]));
    if (stages.length > 1) setCell(ws, row, 4, stageItemsToText(stages[1]));
  }
  
  if (plan.notes) setCell(ws, 24, 0, `备注：${plan.notes}`);
  
  const mainTeacher = plan.signatures?.mainTeacher || '__________';
  const reviewer = plan.signatures?.reviewer || '__________';
  setCell(ws, 25, 0, `主授课老师：${mainTeacher}`);
  setCell(ws, 25, 2, `审核者：${reviewer}`);
}

function setCell(ws: XLSX.WorkSheet, row: number, col: number, value: string) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  const existingCell = ws[cellRef];
  ws[cellRef] = { t: 's', v: value, s: existingCell?.s };
}

export function printTrainingPlan() {
  window.print();
}
