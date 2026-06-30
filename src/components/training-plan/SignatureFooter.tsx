'use client';

interface SignatureFooterProps {
  mainTeacher: string;
  reviewer: string;
  onMainTeacherChange: (val: string) => void;
  onReviewerChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
}

export default function SignatureFooter({
  mainTeacher, reviewer, onMainTeacherChange, onReviewerChange,
  notes, onNotesChange
}: SignatureFooterProps) {
  return (
    <div className="print-area mb-6">
      {/* 备注 */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-3 border-l-4 border-primary-500 pl-3">备注</h3>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none resize-y bg-white"
          rows={3}
          placeholder="备注信息"
        />
      </div>

      {/* 签名 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">主授课老师</label>
          <input
            type="text"
            value={mainTeacher}
            onChange={e => onMainTeacherChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none bg-white"
            placeholder="签字"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">审核者</label>
          <input
            type="text"
            value={reviewer}
            onChange={e => onReviewerChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none bg-white"
            placeholder="签字"
          />
        </div>
      </div>
    </div>
  );
}
