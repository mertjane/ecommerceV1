export function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;

    // arrays → comma separated
    if (Array.isArray(value)) {
      query.append(key, value.join(","));
    } else {
      query.append(key, value);
    }
  });

  return query.toString();
}
