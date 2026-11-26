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
  kind: 'income' | 'expense' | 'invoice_payment' | 'transfer_out';
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'paid' | 'pending_review';
  paidAt: string | null;
  ignored: boolean;
  notes: string | null;
  account: { id: string; name: string } | null;
  /** Compra no cartão (não tem conta). */
  card: { id: string; name: string } | null;
  /** Fatura da compra ou do pagamento de fatura. */
  invoice: { cardId: string; month: string } | null;
  category: { id: string; name: string; icon: string | null } | null;
  /** Transferência: a lista mostra a perna de saída; `to` é a conta de destino. */
  transfer: { id: string; to: { id: string; name: string } | null } | null;
  createdBy: { id: string; name: string };
  series: { id: string; type: 'installment' | 'recurring'; number: number | null; total: number | null } | null;
}

export interface TransactionList {
  month: string;
  summary: { income: number; expense: number; result: number; incomePaid: number; expensePaid: number; pendingCount: number };
  items: TransactionItem[];
}

export type InvoiceStatus = 'future' | 'open' | 'closed' | 'overdue' | 'paid';

export interface CardBase {
  id: string;
  name: string;
  brand: 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'other';
  limit: number;
  closingDay: number;
  dueDay: number;
  paymentAccount: { id: string; name: string };
}

export interface CardSummary extends CardBase {
  used: number;
  available: number;
  currentInvoice: { month: string; closingDate: string; dueDate: string; total: number; paid: number; status: InvoiceStatus };
  due: { month: string; dueDate: string; remaining: number }[];
}

export interface InvoiceView {
  card: CardBase & { archived: boolean };
  invoice: {
    id: string | null;
    month: string;
    closingDate: string;
    dueDate: string;
    total: number;
    paid: number;
    remaining: number;
    status: InvoiceStatus;
  };
  items: {
    id: string;
    kind: 'expense' | 'income';
    amount: number;
    description: string;
    date: string;
    category: { id: string; name: string; icon: string | null } | null;
    installment: { number: number; total: number } | null;
  }[];
  payments: { id: string; amount: number; date: string; account: { id: string; name: string } | null }[];
  prev: string;
  next: string;
}

export interface CardPurchase {
  id: string;
  kind: 'expense' | 'income';
  amount: number;
  description: string;
  date: string;
  category: { id: string; name: string; icon: string | null } | null;
  notes: string | null;
  installments: number;
  card: { id: string; name: string };
  parts: { id: string; number: number | null; amount: number; invoiceId: string }[];
}

export interface Transfer {
  id: string;
  amount: number;
  date: string;
  description: string;
  notes: string | null;
  paid: boolean;
  paidAt: string | null;
  from: { id: string; name: string };
  to: { id: string; name: string };
}

export interface Bills {
  today: string;
  until: string;
  items: TransactionItem[];
  invoices: { cardId: string; cardName: string; month: string; dueDate: string; remaining: number }[];
}
