let singleton = null;

export function getMikroTikMockState() {
  if (singleton) return singleton;

  singleton = {
    nextId: 1,
    profiles: new Set(),
    usersByName: new Map(),
    active: [],
    systemResource: {
      uptime: '3d 04:12:33',
      'cpu-load': '5',
      'free-memory': '512000000',
    },
  };

  // Default bundle profiles expected by the runtime endpoints.
  // These are read dynamically by the mock client (no backend hardcoding of bundles).
  for (const name of ['12Hrs', '24Hrs', '7Days', '30d']) {
    singleton.profiles.add(name);
  }

  return singleton;
}

export function resetMikroTikMockState() {
  singleton = null;
}
