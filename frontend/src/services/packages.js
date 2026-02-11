
// GET /api/packages
export function getPackages() {
  return apiFetch('/api/packages');
}

// GET /api/packages/full
export function getFullPackages() {
  return apiFetch('/api/packages/full');
}
