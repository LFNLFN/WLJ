'use client';

interface EditableNumberedListProps {
  items: string[];
  onChange: (items: string[]) => void;
  label?: string;
}

export default function EditableNumberedList({ items, onChange, label }: EditableNumberedListProps) {
  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
  };

  const addItem = () => {
    onChange([...items, '']);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-1">
      {label && <label className="text-xs text-gray-500">{label}</label>}
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-1">
          <span className="text-xs text-gray-400 mt-2 w-5 shrink-0">{idx + 1}.</span>
          <textarea
            value={item}
            onChange={e => updateItem(idx, e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-primary-500 outline-none resize-y bg-white"
            rows={2}
          />
          <button
            type="button"
            onClick={() => removeItem(idx)}
            className="text-red-400 hover:text-red-600 text-xs mt-1 shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-xs text-primary-600 hover:text-primary-800 mt-1"
      >
        + 添加
      </button>
    </div>
  );
}
