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
