import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';

export interface ExternalIdentity {
  provider: 'google';
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

interface SupabaseUser {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: { full_name?: string; name?: string };
}

/**
 * Confere com o próprio Supabase Auth quem é o dono do token (o Supabase só devolve o usuário
 * se o token for válido, não vencido e não revogado). O token não é guardado.
 */
@Injectable()
export class SupabaseIdentityVerifier {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get enabled() {
    return Boolean(this.config.SUPABASE_URL && this.config.SUPABASE_PUBLISHABLE_KEY);
  }

  async verify(accessToken: string): Promise<ExternalIdentity> {
    if (!this.enabled) throw new ServiceUnavailableException({ error: 'google_disabled', message: 'Login com Google indisponível' });
    let res: Response;
    try {
      res = await fetch(`${this.config.SUPABASE_URL}/auth/v1/user`, {
        headers: { authorization: `Bearer ${accessToken}`, apikey: this.config.SUPABASE_PUBLISHABLE_KEY! },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ServiceUnavailableException({ error: 'identity_unreachable', message: 'Não foi possível confirmar o login com Google agora' });
    }
    if (res.status === 401 || res.status === 403) throw new UnauthorizedException({ error: 'invalid_identity' });
    if (!res.ok) {
      console.error('[auth] Supabase /user respondeu', res.status);
      throw new ServiceUnavailableException({ error: 'identity_unreachable', message: 'Não foi possível confirmar o login com Google agora' });
    }
    const u = (await res.json()) as SupabaseUser;
    const fromGoogle = u.app_metadata?.provider === 'google' || u.app_metadata?.providers?.includes('google');
    if (!u.id || !u.email || !fromGoogle) throw new UnauthorizedException({ error: 'invalid_identity' });
    const email = u.email.trim().toLowerCase();
    return {
      provider: 'google',
      subject: u.id,
      email,
      emailVerified: Boolean(u.email_confirmed_at),
      name: (u.user_metadata?.full_name ?? u.user_metadata?.name ?? email.split('@')[0]!).slice(0, 80),
    };
  }
}
