// Utilities for normalizing backend responses

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractIdFromResponse(obj: any, depth = 0): string | null {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string') return null;
  if (typeof obj === 'object') {
    if (typeof obj.id === 'string') return obj.id;
    if (obj.data) return extractIdFromResponse(obj.data, depth + 1);
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        const found = extractIdFromResponse(val, depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeLineItems(itemsAny: any[]): Record<string, { date: string; minutesCount: number }> {
  const record: Record<string, { date: string; minutesCount: number }> = {};
  for (const it of itemsAny ?? []) {
    if (!it) continue;
    const itemId = (it.id ?? it.ID ?? String(Date.now())) as string;
    record[itemId] = {
      date: it.date ?? it.Date ?? '',
      minutesCount: Number(it.minutes ?? it.minutesCount ?? 0),
    };
  }
  return record;
}
