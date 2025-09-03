export function getPaginationFromUrl(url: URL, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") || String(defaultLimit), 10))
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
