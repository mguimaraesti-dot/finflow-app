import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { api, WORKSPACE_COOKIE } from './api';
import type { Me, WorkspaceSummary } from './types';

/** Pessoa logada, seus espaços e o espaço ativo (cookie; padrão: Pessoal). */
export const getContext = cache(async (returnTo: string) => {
  const [me, workspaces] = await Promise.all([
    api<Me>('/auth/me', { returnTo }),
    api<WorkspaceSummary[]>('/workspaces', { returnTo }),
  ]);
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active = workspaces.find((w) => w.id === chosen) ?? workspaces.find((w) => w.type === 'personal') ?? workspaces[0]!;
  return { me, workspaces, active };
});
