export const nowIso = () => new Date().toISOString();

export function addDaysIso(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}
