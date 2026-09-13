'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getTeachers, deleteTeacher } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/auth/config';

interface TeacherAccount {
  teacherId: string;
  hasAccount: boolean;
  userId: string;
  accountName: string;
  role: string;
  status: string;
  lastLoginAt: string;
  mustChangePassword: boolean;
}

export default function TeachersPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accounts, setAccounts] = useState<Record<string, TeacherAccount>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ name: string; title: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = () => {
    getTeachers()
      .then(data => {
        // 确保 API 返回的是数组，否则兜底为空数组
        if (Array.isArray(data)) {
          setTeachers(data);
        } else {
          console.error('API 返回数据格式错误（期望数组）:', data);
          setTeachers([]);
          setError('数据格式异常，请稍后重试');
        }
      })
      .catch(err => {
        console.error('加载失败:', err);
        setError('加载失败: ' + err.message);
      });
  };

  /** 仅管理员：拉取教师登录账号状态 */
  const loadAccounts = () => {
    fetch('/api/admin/teacher-accounts')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!Array.isArray(data)) return;
        const map: Record<string, TeacherAccount> = {};
        data.forEach((a: TeacherAccount) => {
          map[a.teacherId] = a;
        });
        setAccounts(map);
      })
      .catch(() => {
        /* 非管理员会 403，静默忽略 */
      });
  };

  useEffect(() => {
    loadData();
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const admin = data?.user?.role === 'admin';
        setIsAdmin(admin);
        if (admin) loadAccounts();
      })
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = (teacher: any) => {
    if (confirm(`确定要删除教师 "${teacher.name}" 吗？`)) {
      deleteTeacher(teacher._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  /** 开通账号 / 重置密码 */
  const handleAccountAction = async (teacher: any, action: 'create' | 'reset') => {
    const isCreate = action === 'create';
    const tip = isCreate
      ? `确定为「${teacher.name}」开通登录账号吗？\n账号为其手机号，系统会生成一个临时密码（只显示一次）。`
      : `确定重置「${teacher.name}」的登录密码吗？\n系统会生成新的临时密码（只显示一次），原密码立即失效。`;
    if (!confirm(tip)) return;

    setBusyId(teacher._id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teachers/${teacher._id}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '操作失败');
      setDialog({
        name: teacher.name,
        title: isCreate ? '初始密码（只显示这一次）' : '临时密码（只显示这一次）',
        value: data.tempPassword,
      });
      loadAccounts();
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const copyValue = (v: string) => {
    navigator.clipboard?.writeText(v).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false)
    );
  };

  const columns = [
    { key: 'name', label: '姓名' },
    { key: 'gender', label: '性别',
      render: (val: string) => val || '-'
    },
    { key: 'phone', label: '电话' },
    { key: 'hireDate', label: '入职时间',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-'
    },
    { key: 'rank', label: '职级',
      render: (val: string) => val ? (
        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{val}</span>
      ) : '-'
    },
    // 仅管理员可见的「登录账号」列
    ...(isAdmin ? [{
      key: '_account',
      label: '登录账号',
      render: (_val: any, row: any) => {
        const acc = accounts[row._id];
        if (!acc || !acc.hasAccount) {
          return <span className="text-xs text-gray-400">未开通</span>;
        }
        return (
          <div className="text-xs leading-relaxed">
            <div className="text-gray-700">
              {acc.accountName}（{ROLE_LABELS[acc.role] || acc.role}）
              {acc.status !== 'active' && <span className="ml-1 text-gray-400">已停用</span>}
            </div>
            <div className="text-gray-400">
              {acc.mustChangePassword ? '待改密' : '密码正常'} · 最近登录：{acc.lastLoginAt || '从未登录'}
            </div>
          </div>
        );
      },
    }] : []),
    { key: 'createdAt', label: '添加时间',
      render: (val: string) => new Date(val).toLocaleDateString('zh-CN')
    },
  ];

  // 仅管理员：开通账号 / 重置密码
  const actions = isAdmin
    ? [
        {
          label: '开通账号',
          color: 'text-[#F08020]',
          hoverColor: 'hover:bg-[#FFF0E0]',
          onClick: (row: any) => handleAccountAction(row, 'create'),
        },
        {
          label: '重置密码',
          color: 'text-amber-600',
          hoverColor: 'hover:bg-amber-50',
          onClick: (row: any) => handleAccountAction(row, 'reset'),
        },
      ]
    : undefined;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500">
              {error ? (
                <span className="text-red-500">{error}</span>
              ) : (
                `共 ${teachers.length} 位教师`
              )}
            </p>
            <button
              onClick={() => router.push('/teachers/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 添加教师
            </button>
          </div>
          <Table
            columns={columns}
            data={teachers}
            onEdit={(row) => router.push(`/teachers/edit?id=${row._id}`)}
            onDelete={handleDelete}
            actions={actions}
            rowKey="_id"
          />
          {isAdmin && (
            <p className="mt-4 text-xs text-gray-400 leading-relaxed">
              说明：教师登录账号的手机号取自教师档案里的「电话」。管理员重置后，系统会生成一次性临时密码，
              请线下告知该教师，他首次登录后会被要求立即修改密码。
            </p>
          )}
        </main>
      </div>

      {/* 一次性密码弹窗 */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-medium text-gray-800 mb-1">
              {dialog.name} · {dialog.title}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              请复制并线下告知该教师。对方登录后系统会要求立即修改密码。
            </p>
            <div className="rounded-xl border-2 border-dashed border-[#F08020] bg-orange-50/50 p-4 text-center">
              <div className="text-xl font-mono font-semibold tracking-wider text-[#E04020] break-all">
                {dialog.value}
              </div>
              <button
                type="button"
                onClick={() => copyValue(dialog.value)}
                className="mt-3 rounded-lg bg-white border border-[#F08020] px-4 py-1.5 text-sm text-[#F08020]"
              >
                {copied ? '已复制 ✓' : '复制'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setDialog(null);
                setCopied(false);
              }}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-2.5 text-white"
            >
              我已记录，关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
