'use client';

/**
 * 📚 知识库面板（AI 智能助理页面内弹出）
 *
 * 让老师直接在页面上「上传资料进知识库」：
 *  - 上传文件（服务端抽取成纯文本后入库）：txt / md / csv / json / xlsx / xls / docx …
 *  - 或直接粘贴文本
 *  - 按关键词 / 分类搜索，查看正文，删除
 *
 * 入库的资料会被 AI 工具 search_knowledge_base 检索到（source = knowledge_documents），
 * 因此上传后直接问助理「我刚上传的资料里……」即可。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createKnowledgeText,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  listKnowledgeDocuments,
  uploadKnowledgeFile,
  type KnowledgeDocumentSummary,
} from '@/lib/api';

const CATEGORIES = ['机构制度', '课程体系', '评估量表', '教案', '训练计划', '康复档案', '其它'];

const ACCEPT =
  '.txt,.md,.markdown,.csv,.tsv,.json,.log,.html,.htm,.xml,.yml,.yaml,.xlsx,.xls,.xlsm,.docx';

function formatSize(bytes?: number | null) {
  const n = Number(bytes || 0);
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 19).replace('T', ' ');
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function KnowledgePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<KnowledgeDocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 上传表单
  const [title, setTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('其它');
  const [pasted, setPasted] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 展开查看的详情
  const [expanded, setExpanded] = useState<{ id: string; content: string } | null>(null);

  const refresh = useCallback(
    async (q = keyword, cat = category) => {
      setLoading(true);
      setError('');
      try {
        const res = await listKnowledgeDocuments({ q, category: cat, limit: 100 });
        setItems(res?.items || []);
        setTotal(res?.total || 0);
      } catch (err: any) {
        setError(err?.message || '读取知识库失败');
      } finally {
        setLoading(false);
      }
    },
    [keyword, category]
  );

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const doc = await uploadKnowledgeFile(file, { title: title.trim(), category: uploadCategory });
      setNotice(
        `已上传「${doc.title}」，入库 ${doc.contentLength ?? 0} 字${doc.notes?.length ? `（${doc.notes.join('；')}）` : ''}`
      );
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      await refresh('', category);
    } catch (err: any) {
      setError(err?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSubmit = async () => {
    if (!title.trim() || !pasted.trim()) {
      setError('请填写标题和内容');
      return;
    }
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const doc = await createKnowledgeText({ title: title.trim(), category: uploadCategory, content: pasted });
      setNotice(`已入库「${doc.title}」`);
      setTitle('');
      setPasted('');
      await refresh('', category);
    } catch (err: any) {
      setError(err?.message || '保存失败');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleDetail = async (item: KnowledgeDocumentSummary) => {
    if (expanded?.id === item.id) {
      setExpanded(null);
      return;
    }
    try {
      const full = await getKnowledgeDocument(item.id);
      setExpanded({ id: item.id, content: full?.content || '' });
    } catch (err: any) {
      setError(err?.message || '读取正文失败');
    }
  };

  const handleDelete = async (item: KnowledgeDocumentSummary) => {
    if (!confirm(`确定删除知识库资料「${item.title}」？删除后 AI 将检索不到它。`)) return;
    try {
      await deleteKnowledgeDocument(item.id);
      if (expanded?.id === item.id) setExpanded(null);
      setNotice(`已删除「${item.title}」`);
      await refresh();
    } catch (err: any) {
      setError(err?.message || '删除失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-800">📚 知识库</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              上传的资料会进入平台知识库，AI 智能助理可直接检索（共 {total} 份）
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {/* 上传区 */}
          <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="资料标题（不填则用文件名）"
                className="sm:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {uploading ? '处理中...' : '📎 选择文件上传'}
              </button>
              <span className="text-xs text-gray-500">
                支持 txt / md / csv / json / xlsx / xls / docx（单个 ≤ 8MB）；PDF、旧版 .doc 暂不支持
              </span>
            </div>

            <div className="mt-3">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={3}
                placeholder="或者直接把资料内容粘贴到这里，点「保存为资料」入库"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
              <button
                onClick={handlePasteSubmit}
                disabled={uploading || !title.trim() || !pasted.trim()}
                className="mt-2 px-4 py-2 bg-white border border-primary-300 text-primary-600 text-sm rounded-lg hover:bg-primary-50 disabled:opacity-50"
              >
                💾 保存为资料
              </button>
            </div>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          {notice && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</div>
          )}

          {/* 检索 + 列表 */}
          <div className="flex gap-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refresh()}
              placeholder="搜索标题或正文..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                refresh(keyword, e.target.value);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部分类</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => refresh()}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
            >
              搜索
            </button>
          </div>

          <div className="space-y-2">
            {loading && <p className="text-sm text-gray-400">加载中...</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm text-gray-400">还没有资料，上传一份试试（上传后助理就能检索到）。</p>
            )}
            {items.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm truncate">{item.title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-500">
                        {item.category}
                      </span>
                      {item.filename && (
                        <span className="text-[11px] text-gray-400">
                          {item.filename} {formatSize(item.size)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">
                      {String(item.content || '').slice(0, 160)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {formatDate(item.createdAt)} ｜ {item.contentLength ?? 0} 字
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleDetail(item)}
                      className="text-xs text-primary-600 hover:text-primary-800"
                    >
                      {expanded?.id === item.id ? '收起' : '查看'}
                    </button>
                    <button onClick={() => handleDelete(item)} className="text-xs text-red-500 hover:text-red-700">
                      删除
                    </button>
                  </div>
                </div>
                {expanded?.id === item.id && (
                  <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2">
                    {expanded.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 text-xs text-gray-400">
          资料以纯文本入库（上传文件会先抽取文字）；含儿童个人信息的资料请谨慎上传。
        </div>
      </div>
    </div>
  );
}
