import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { TrainingPlan, ExportConfig } from '@/lib/types';

// 根据 valuePath 从对象中取值，如 "child.name" 或 "trainingModules[].moduleTitle"
function getValueByPath(obj: any, path: string): any {
  if (path.includes('[]')) {
    const [prefix, suffix] = path.split('[]');
    const arr = getValueByPath(obj, prefix);
    if (Array.isArray(arr)) {
      return arr.map((item: any) => getValueByPath(item, suffix));
    }
    return [];
  }
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null) return '';
    current = current[key];
  }
  return current;
}

function formatArrayAsText(arr: string[]): string {
  return arr.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

export function exportTrainingPlanToExcel(plan: TrainingPlan, config: ExportConfig) {
  const wb = XLSX.utils.book_new();
  const ws: any[][] = [];
  const colCount = 7;

  // 标题行
  for (const rowDef of config.layout.titleRows) {
    const val = getValueByPath(plan, rowDef.valuePath);
    ws.push([val]);
  }

  // 空行
  ws.push([]);

  // 儿童信息
  for (const rowDef of config.layout.profileRows) {
    const row: any[] = [];
    for (let i = 0; i < rowDef.length; i += 2) {
      const label = rowDef[i];
      const path = rowDef[i + 1] as string;
      const val = getValueByPath(plan, path);
      row.push(label, val || '');
    }
    ws.push(row);
  }

  // 空行
  ws.push([]);

  // 表格表头
  const tableConfig = config.layout.moduleTable;
  ws.push(tableConfig.columns.map(c => c.header));

  // 表格数据
  const modules = plan.trainingModules;
  const maxRows = Math.max(
    ...modules.map(m => Math.max(m.initialAssessment.length, m.stageOne.items.length, m.stageTwo.items.length, 1))
  );

  for (let i = 0; i < maxRows; i++) {
    const row: any[] = [];
    for (const col of tableConfig.columns) {
      let values = getValueByPath(plan, col.valuePath);
      if (!Array.isArray(values)) {
        values = [values];
      }
      if (col.renderAs === 'numberedText') {
        // 每个模块的多行文本
        const moduleValues = getValueByPath(plan, col.valuePath.replace('[]', '')) as any[];
        if (Array.isArray(moduleValues) && moduleValues.length > 0) {
          row.push(moduleValues.map((v: any, idx: number) => `${idx + 1}. ${v}`).join('\n'));
        } else {
          row.push('');
        }
      } else {
        row.push(values[i] || '');
      }
    }
    ws.push(row);
  }

  // 空行
  ws.push([]);

  // 备注
  ws.push(['备注', plan.notes]);

  // 签名
  ws.push([]);
  ws.push(['主授课老师', plan.signatures.mainTeacher, '', '审核者', plan.signatures.reviewer]);

  // 创建工作表
  const sheet = XLSX.utils.aoa_to_sheet(ws);

  // 设置列宽
  sheet['!cols'] = [
    { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }
  ];

  XLSX.utils.book_append_sheet(wb, sheet, config.sheetName || '训练阶段计划');

  // 导出
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const fileName = `${plan.child.name || '训练计划'}_${plan.planTitle || '阶段计划'}.xlsx`;
  saveAs(blob, fileName);
}

export function printTrainingPlan() {
  window.print();
}
