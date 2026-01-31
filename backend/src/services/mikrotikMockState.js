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

  return singleton;
}

export function resetMikroTikMockState() {
  singleton = null;
}
