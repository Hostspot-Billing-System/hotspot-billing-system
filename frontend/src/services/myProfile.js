// POST /api/users/change-password
export function changeMyPassword(payload) {
  return apiFetch('/api/users/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// GET /api/my-profile
export function getMyProfile() {
  return apiFetch('/api/my-profile');
}

// PUT /api/my-profile
export function updateMyProfile(payload) {
  return apiFetch('/api/my-profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

// POST /api/my-profile/change-password
export function changeMyProfilePassword(payload) {
  return apiFetch('/api/my-profile/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}
