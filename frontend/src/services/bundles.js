import { apiFetch } from '../utils/requests';

  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/bundles?${search}`);
}

export async function listBundles(params) {
  const data = await getBundles(params);
  if (data && typeof data === 'object' && data.success === true && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
}

  return apiFetch('/api/bundles', {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

  return apiFetch(`/api/bundles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

  return apiFetch(`/api/bundles/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    credentials: 'include',
  });
}

  return apiFetch(`/api/bundles/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
