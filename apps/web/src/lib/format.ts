const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-11" → "novembro de 2026" */
export function monthLabel(month: string): string {
  const s = monthFmt.format(new Date(`${month}-01T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cabeçalho de dia: "HOJE · QUARTA, 26 NOV" */
export function dayLabel(date: string, today: string): string {
  const base = dayFmt.format(new Date(`${date}T12:00:00Z`)).replace('.', '').replace('-feira', '');
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  const prefix = date === today ? 'Hoje · ' : date === yesterday ? 'Ontem · ' : date > today ? 'Previsto · ' : '';
  return `${prefix}${base}`.toUpperCase();
}
