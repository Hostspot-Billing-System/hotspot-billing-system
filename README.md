# Hotspot Billing System

## Local Development

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Dark Mode

The admin portal supports a global theme preference:

- **Default:** follow system (`prefers-color-scheme`)
- **Options:** `system`, `light`, `dark`
- **Dark base color:** `#131a2a`

### Where to toggle

- **Login screen:** top-right toggle
- **Admin dashboard:** sidebar toggle

### How it’s stored

Theme preference is persisted in `localStorage` under:

- `hotspot.themePreference`

To reset to the default behavior, remove that key from `localStorage`.