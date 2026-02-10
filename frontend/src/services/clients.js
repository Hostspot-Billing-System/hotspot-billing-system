import { apiFetch } from '../utils/requests';

  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/clients/overview?${search}`);
}
