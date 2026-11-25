import { z } from 'zod';
import { isValidIsoDate } from './dates.js';

/** Esquemas compartilhados entre Web, Mobile e API: o mesmo valida dos dois lados. */

const email = z.string().trim().toLowerCase().email('E-mail inválido').max(254);

export const passwordSchema = z
  .string()
  .min(10, 'Use pelo menos 10 caracteres')
  .max(128, 'Use no máximo 128 caracteres');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome').max(80),
  email,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(256) });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});

export const WORKSPACE_TYPES = ['personal', 'shared'] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export const MEMBER_ROLES = ['owner', 'editor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const createSharedWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao espaço').max(60).default('Casal'),
});

export const createInviteSchema = z.object({
  email,
  role: z.enum(['editor', 'viewer']).default('editor'),
});

export const acceptInviteSchema = z.object({ token: z.string().min(32).max(256) });

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'digital', 'investment', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  digital: 'Conta digital',
  investment: 'Investimentos',
  other: 'Outra',
};

const cents = z.number().int().refine(Number.isSafeInteger, 'Valor fora do limite');
const isoDate = z.string().refine(isValidIsoDate, 'Data inválida');

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à conta').max(60),
  type: z.enum(ACCOUNT_TYPES),
  initialBalance: cents.default(0),
  openingDate: isoDate.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, 'Cor inválida')
    .optional(),
  includeInTotal: z.boolean().default(true),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
