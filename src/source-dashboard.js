const DASHBOARD_CONFIG_CACHE_TTL = 60_000;
const dashboardConfigCache = new Map();
const dashboardConfigInflight = new Map();

export function createDashboardCacheKey(sourceDashboard, sourceView = "") {
  return `${sourceDashboard || ""}::${sourceView || ""}`;
}

export function extractSourceStructure(lovelaceConfig, sourceView = "") {
  const views = Array.isArray(lovelaceConfig?.views) ? lovelaceConfig.views : [];
  let targetViews = views;

  if (sourceView) {
    const selected = views.find((view) => view?.path === sourceView || view?.title === sourceView);
    targetViews = selected ? [selected] : [];
  }

  const sections = targetViews.flatMap((view) => (Array.isArray(view?.sections) ? view.sections : []));
  if (sections.length > 0) {
    return {
      type: "sections",
      maxColumns: targetViews.find((view) => view?.max_columns)?.max_columns || 4,
      sections,
    };
  }

  return {
    type: "flat",
    cards: targetViews.flatMap((view) => (Array.isArray(view?.cards) ? view.cards : [])),
  };
}

export function countSourceCards(structure) {
  if (structure?.type === "sections") {
    return structure.sections.reduce((count, section) => count + (Array.isArray(section?.cards) ? section.cards.length : 0), 0);
  }
  return Array.isArray(structure?.cards) ? structure.cards.length : 0;
}

export function invalidateDashboardConfigCache(sourceDashboard) {
  if (!sourceDashboard) {
    dashboardConfigCache.clear();
    dashboardConfigInflight.clear();
    return;
  }
  for (const key of dashboardConfigCache.keys()) {
    if (key.startsWith(`${sourceDashboard}::`)) dashboardConfigCache.delete(key);
  }
  for (const key of dashboardConfigInflight.keys()) {
    if (key.startsWith(`${sourceDashboard}::`)) dashboardConfigInflight.delete(key);
  }
}

export async function fetchDashboardConfig(hass, sourceDashboard, sourceView = "") {
  const key = createDashboardCacheKey(sourceDashboard, sourceView);
  const cached = dashboardConfigCache.get(key);
  if (cached && Date.now() - cached.timestamp < DASHBOARD_CONFIG_CACHE_TTL) return cached.value;
  if (dashboardConfigInflight.has(key)) return dashboardConfigInflight.get(key);

  const promise = (async () => {
    try {
      const config = await hass.callWS({ type: "lovelace/config", url_path: sourceDashboard });
      dashboardConfigCache.set(key, { timestamp: Date.now(), value: config });
      return config;
    } finally {
      dashboardConfigInflight.delete(key);
    }
  })();
  dashboardConfigInflight.set(key, promise);
  return promise;
}
