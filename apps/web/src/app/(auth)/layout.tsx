export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-8 px-4 py-10">
      <div>
        <p className="text-[28px] font-semibold tracking-tight">FinFlow</p>
        <p className="text-[13px] text-ink-2">Gestão financeira para você ou para o casal.</p>
      </div>
      {children}
    </main>
  );
}
