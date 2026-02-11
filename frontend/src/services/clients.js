
// GET /api/clients/overview
export function getClientsOverview(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/clients/overview?${search}`);
}
