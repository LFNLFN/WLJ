import type { Metadata } from 'next';
import ForgotForm from './ForgotForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '找回密码 - 未来家儿童能力发展中心',
};

export default function ForgotPage() {
  return <ForgotForm />;
}
