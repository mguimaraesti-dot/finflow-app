import type { Tx } from '@finflow/db';

const EXPENSE = [
  ['Alimentação', 'utensils'],
  ['Supermercado', 'shopping-cart'],
  ['Casa', 'house'],
  ['Transporte', 'car'],
  ['Saúde', 'heart-pulse'],
  ['Educação', 'graduation-cap'],
  ['Lazer', 'party-popper'],
  ['Assinaturas', 'repeat'],
  ['Compras', 'shopping-bag'],
  ['Outros', 'circle-ellipsis'],
] as const;

const INCOME = [
  ['Salário', 'wallet'],
  ['Renda extra', 'briefcase'],
  ['Rendimentos', 'trending-up'],
  ['Outros', 'circle-ellipsis'],
] as const;

export async function seedDefaultCategories(tx: Tx, workspaceId: string): Promise<void> {
  await tx.category.createMany({
    data: [
      ...EXPENSE.map(([name, icon]) => ({ workspaceId, name, icon, kind: 'expense' as const })),
      ...INCOME.map(([name, icon]) => ({ workspaceId, name, icon, kind: 'income' as const })),
    ],
  });
}
