import { apiFetch } from '../utils/requests';

  return apiFetch('/api/my-profile');
}

  return apiFetch('/api/my-profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

  return apiFetch('/api/my-profile/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}
