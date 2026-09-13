import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '登录 - 未来家儿童能力发展中心',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string | string[] };
}) {
  const raw = searchParams?.next;
  const nextPath = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  return <LoginForm nextPath={nextPath} />;
}
