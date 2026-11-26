/**
 * Datas de calendário (competência, vencimento) são strings ISO "yyyy-mm-dd",
 * sem fuso. Nunca passam por Date com horário local.
 */
export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

export function parseIsoDate(value: IsoDate): YMD {
  const m = ISO.exec(value);
  if (!m) throw new RangeError(`Data inválida: ${value}`);
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (ymd.month < 1 || ymd.month > 12 || ymd.day < 1 || ymd.day > daysInMonth(ymd.year, ymd.month)) {
    throw new RangeError(`Data inválida: ${value}`);
  }
  return ymd;
}

export function toIsoDate({ year, month, day }: YMD): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Soma meses mantendo o ano/mês coerentes (dia não incluído). */
export function addMonthsYM(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Dia "d" no mês, limitado ao último dia (31 em fevereiro → 28/29). */
export function clampedDate(year: number, month: number, day: number): IsoDate {
  return toIsoDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

/** Soma meses a uma data, limitando o dia ao fim do mês de destino. */
export function addMonths(date: IsoDate, delta: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const target = addMonthsYM(year, month, delta);
  return clampedDate(target.year, target.month, day);
}

/** Soma dias a uma data de calendário. */
export function addDays(date: IsoDate, delta: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return toIsoDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "Hoje" no fuso informado (o servidor roda em UTC). */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}
