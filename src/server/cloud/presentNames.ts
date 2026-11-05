/** Resolve current professional names only when a stored author/responsible UID
 * proves which account owns the record. Historical documents stay untouched.
 */
export function presentOfficialNames<T>(value: T, names: ReadonlyMap<string, string>): T {
  if (Array.isArray(value)) return value.map(item => presentOfficialNames(item, names)) as T;
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = presentOfficialNames(item, names);
  for (const key of Object.keys(result)) {
    const suffix = key.endsWith('Name') ? 'Name' : key.endsWith('Nome') ? 'Nome' : '';
    if (!suffix || typeof result[key] !== 'string') continue;
    const stem = key.slice(0, -suffix.length);
    const uid = [stem + 'Id', stem + 'Uid', stem + 'UID'].map(idKey => result[idKey])
      .find(id => typeof id === 'string' && names.has(id));
    if (typeof uid === 'string') result[key] = names.get(uid)!;
  }
  return result as T;
}
