# 0004 — Autenticação

Data: 25/11/2026 · Status: aceita

## Decisão
- Senhas com Argon2id (parâmetros OWASP: 19 MiB, 2 iterações). Mínimo de 10 caracteres.
- Access token JWT HS256 de 15 minutos (`sub`, `sid`, `typ`).
- Refresh token opaco de 30 dias; o banco guarda só o SHA-256. A cada uso é trocado por outro
  (rotação). Reapresentar um refresh já trocado revoga todas as sessões da pessoa.
- Recuperação de senha por link de uso único (30 min); trocar a senha encerra todas as sessões.
  A resposta é a mesma exista ou não a conta.
- Login com e-mail inexistente compara contra um hash fixo para o tempo não denunciar contas.
- Limite de tentativas por IP nas rotas públicas.
- Web: tokens em cookies httpOnly + SameSite=Lax; o navegador nunca os lê.

## Pendente (próximos incrementos)
- Verificação em duas etapas (TOTP), com o segredo cifrado (`users.mfa_secret_enc`).
- Verificação de e-mail no cadastro.
- Provedor de e-mail real (hoje o `MailerService` só registra no log; convites mostram o link para
  ser enviado por outro canal).
- Logout imediato do access token (hoje vale até expirar, no máximo 15 minutos).
