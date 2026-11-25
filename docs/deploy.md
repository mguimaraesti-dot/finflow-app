# Publicação (Supabase + Vercel)

Três peças: o **banco** no Supabase, a **API** e a **Web** como dois projetos na Vercel, os dois
apontando para este repositório. Nenhuma senha fica no código nem no chat: só nos secrets do GitHub
e nas variáveis de ambiente da Vercel.

## 1. Banco (Supabase)

1. No painel do projeto Supabase, abra **Connect** e copie a string do **Session pooler**
   (porta 5432, usuário `postgres.<ref>`). Ela é o `PROD_DATABASE_URL`.
2. Crie uma senha forte para o papel da aplicação (gerenciador de senhas). Ela é o
   `PROD_API_DB_PASSWORD`.
3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, crie os dois.
4. Em **Actions → Database → Run workflow**. O job cria os papéis `finflow_app`/`finflow_api` e aplica
   as migrations. Depois disso, todo push que mexer em migrations roda sozinho.

A migration `harden_public_access` tira o acesso dos papéis `anon`/`authenticated` da Data API do
Supabase. Opcionalmente, desligue a Data API em **Settings → Data API**: o FinFlow não a usa.

## 2. API (Vercel)

1. **Add New → Project**, importe `finflow-app`, **Root Directory** `apps/api`.
2. Variáveis de ambiente:
   - `DATABASE_URL_APP`: string do **Transaction pooler** (porta 6543), trocando o usuário por
     `finflow_api.<ref>` e a senha pela `PROD_API_DB_PASSWORD`, e acrescentando
     `?pgbouncer=true&connection_limit=1` no fim.
   - `JWT_ACCESS_SECRET`: resultado de `openssl rand -base64 48`.
   - `WEB_URL`: endereço da Web (preencha depois do passo 3 e faça um novo deploy).
3. Deploy. Teste `https://<api>.vercel.app/health` → `{"status":"ok"}`.

## 3. Web (Vercel)

1. Outro projeto a partir do mesmo repositório, **Root Directory** `apps/web`.
2. Variável `API_URL`: endereço da API do passo 2 (sem barra no fim).
3. Deploy. Volte na API, ajuste `WEB_URL` e faça redeploy.

## Observações

- Região das funções: `gru1` (São Paulo), em `vercel.json`. Se o Supabase estiver em outra região,
  ajuste para a mais próxima dele.
- O limite de tentativas de login é por instância serverless; um limitador compartilhado (Redis)
  entra quando houver usuários além do uso pessoal.
- Sem provedor de e-mail ainda: a redefinição de senha não chega a ninguém (o corpo do e-mail não
  vai para os logs, de propósito). Convites funcionam, porque o link aparece na tela para copiar.
