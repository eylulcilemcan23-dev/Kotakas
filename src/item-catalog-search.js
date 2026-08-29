export function parseCatalogSearchQuery(value = '') {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  if (!raw) return { raw: '', itemQuery: '', enhancement: null };

  const match = raw.match(/^(.*?)(?:\s*\+\s*|\s*)(\d{1,2})$/);
  if (!match) return { raw, itemQuery: raw, enhancement: null };

  const itemQuery = match[1].trim();
  const enhancement = Number.parseInt(match[2], 10);
  if (itemQuery.length < 2 || !Number.isFinite(enhancement) || enhancement < 0 || enhancement > 21) {
    return { raw, itemQuery: raw, enhancement: null };
  }

  return { raw, itemQuery, enhancement };
}

export function catalogSearchRankExpression(exactParam, prefixParam) {
  return `case
    when lower(canonical_name) = ${exactParam} then 0
    when lower(slug) = replace(${exactParam}, ' ', '-') then 1
    when exists (select 1 from unnest(coalesce(keywords,'{}'::text[])) k where lower(k) = ${exactParam}) then 2
    when lower(canonical_name) like ${prefixParam} then 3
    when exists (select 1 from unnest(coalesce(keywords,'{}'::text[])) k where lower(k) like ${prefixParam}) then 4
    else 5
  end`;
}
