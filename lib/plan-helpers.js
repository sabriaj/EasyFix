const planCategoryLimit = { free: 2, premium: 7 };

function normalizeCategoryKey(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function parseCategoriesFromBody(body) {
  const b = body || {};
  let v = b.categories ?? b.category ?? null;

  if (v == null) return [];

  if (Array.isArray(v)) {
    return v.map(normalizeCategoryKey).filter(Boolean);
  }

  const s = String(v).trim();
  if (!s) return [];

  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(normalizeCategoryKey).filter(Boolean);
    } catch {}
  }

  if (s.includes(",")) {
    return s.split(",").map(normalizeCategoryKey).filter(Boolean);
  }

  return [normalizeCategoryKey(s)].filter(Boolean);
}

export function applyCategoryPlanLimit(categories, plan) {
  const p = String(plan || "").toLowerCase();
  const max = planCategoryLimit[p] ?? 1;

  const out = [];
  const seen = new Set();
  for (const c of (categories || [])) {
    const k = normalizeCategoryKey(c);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  return out.slice(0, max);
}
