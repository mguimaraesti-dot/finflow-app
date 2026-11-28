import type { Metadata } from 'next';
import { googleLoginEnabled } from '@/lib/supabase';
import { ForgotForm } from '../forms';

export const metadata: Metadata = { title: 'Esqueci a senha' };

export default function Page() {
  return <ForgotForm google={googleLoginEnabled()} />;
}
