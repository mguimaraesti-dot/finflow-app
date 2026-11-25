import { describe, expect, it } from 'vitest';
import { formatBRL, parseBRL, splitInstallments } from './money.js';

describe('formatBRL', () => {
  it('formata com separador brasileiro e espaço comum', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(5)).toBe('R$ 0,05');
  });
  it('usa o sinal de menos tipográfico', () => {
    expect(formatBRL(-20000)).toBe('− R$ 200,00');
  });
  it('recusa valores que não são centavos inteiros', () => {
    expect(() => formatBRL(1.5)).toThrow();
  });
});

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['R$ 10', 1000],
    ['10,5', 1050],
    ['10.5', 1050],
    ['1.000', 100000],
    ['-3,20', -320],
    ['− R$ 3,20', -320],
  ])('%s → %i', (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });
  it.each(['', 'abc', '1,234,5', '10,999'])('rejeita %j', (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe('splitInstallments', () => {
  it('soma exatamente o total, com o resto na primeira parcela', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  });
  it('funciona para qualquer total e quantidade', () => {
    for (let total = 1; total < 5000; total += 37) {
      for (let n = 1; n <= 24; n++) {
        const parts = splitInstallments(total, n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(parts).toHaveLength(n);
      }
    }
  });
  it('recusa quantidade inválida', () => {
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(100, 1.5)).toThrow();
  });
});
