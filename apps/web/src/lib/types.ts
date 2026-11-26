export interface Me {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  type: 'personal' | 'shared';
  role: 'owner' | 'editor' | 'viewer' | null;
  members: { userId: string; name: string; role: string }[];
}

export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  includeInTotal: boolean;
  currentBalance: number;
  projectedBalance: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export type FormState = { ok: boolean; message?: string; fields?: Record<string, string>; data?: Record<string, string> } | null;

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  icon: string | null;
}

export interface TransactionItem {
  id: string;
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'paid' | 'pending_review';
  paidAt: string | null;
  ignored: boolean;
  notes: string | null;
  account: { id: string; name: string } | null;
  category: { id: string; name: string; icon: string | null } | null;
  createdBy: { id: string; name: string };
  series: { id: string; type: 'installment' | 'recurring'; number: number | null; total: number | null } | null;
}

export interface TransactionList {
  month: string;
  summary: { income: number; expense: number; result: number; incomePaid: number; expensePaid: number; pendingCount: number };
  items: TransactionItem[];
}
