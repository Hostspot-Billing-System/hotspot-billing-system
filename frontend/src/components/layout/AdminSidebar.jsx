import React, { memo } from 'react';
import styles from './AdminSidebar.module.css';
import { ADMIN_SIDEBAR_MENU } from './adminSidebarMenu';

function SvgIcon({ name, className }) {
  const common = {
    className,
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    focusable: false,
  };

  switch (name) {
    case 'grid':
      return (
        <svg {...common}>
          <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" fill="currentColor" />
        </svg>
      );
    case 'cube':
      return (
        <svg {...common}>
          <path
            d="M12 2 21 7v10l-9 5-9-5V7l9-5Zm0 2.2L5 7.5v8.9l7 3.9 7-3.9V7.5L12 4.2Z"
            fill="currentColor"
          />
          <path d="M12 4.2 19 7.5 12 10.9 5 7.5 12 4.2Z" fill="currentColor" opacity="0.55" />
        </svg>
      );
    case 'ticket':
      return (
        <svg {...common}>
          <path
            d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M13 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
      );
    case 'swap':
      return (
        <svg {...common}>
          <path d="M7 7h11l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 17H7l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common}>
          <path
            d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2h-5a3 3 0 0 0 0 6h5v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M17 13h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 16V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path
            d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"
            fill="currentColor"
            opacity="0.85"
          />
          <path
            d="M21 20a5 5 0 0 0-10 0M11 20a5 5 0 0 0-10 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'userPlus':
      return (
        <svg {...common}>
          <path d="M10 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" fill="currentColor" opacity="0.85" />
          <path d="M3 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M19 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M22 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'router':
      return (
        <svg {...common}>
          <path d="M4 15h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 15v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 15v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 11a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'status':
      return (
        <svg {...common}>
          <path
            d="M12 21a9 9 0 1 0-9-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M3 12h9l3-3 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'hotspot':
      return (
        <svg {...common}>
          <path d="M12 20a2 2 0 1 0-2-2 2 2 0 0 0 2 2Z" fill="currentColor" />
          <path
            d="M8.5 14.5a5 5 0 0 1 7 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.8"
          />
          <path
            d="M6 12a8 8 0 0 1 12 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
      );
    case 'magic':
      return (
        <svg {...common}>
          <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 17l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 8l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case 'page':
      return (
        <svg {...common}>
          <path
            d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M14 3v4a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'sessions':
      return (
        <svg {...common}>
          <path
            d="M7 17h10a4 4 0 0 0 0-8H7a4 4 0 0 0 0 8Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" fill="currentColor" opacity="0.85" />
          <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...common}>
          <path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 12H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M13 9l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

function LockIcon({ className }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 11h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M6 11h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AdminSidebarItem({ item, isActive, onNavigate }) {
  return (
    <>
      <button
        type="button"
        className={
          styles.item +
          (item.spacerBefore ? ` ${styles.spacerBefore}` : '') +
          (isActive ? ` ${styles.active}` : '')
        }
        onClick={() => {
          if (item.locked) return;
          onNavigate?.(item);
        }}
        disabled={Boolean(item.locked)}
        aria-disabled={Boolean(item.locked)}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className={styles.iconWrap} aria-hidden="true">
          <SvgIcon name={item.icon} className={styles.icon} />
        </span>
        <span className={styles.label}>{item.label}</span>
        {item.locked ? (
          <span className={styles.lockWrap} aria-hidden="true">
            <LockIcon className={styles.lockIcon} />
          </span>
        ) : null}
      </button>
      {item.dividerAfter ? <div className={styles.sectionDivider} aria-hidden="true" /> : null}
    </>
  );
}

function resolveActiveKey({ activeKey, activePath }) {
  if (activeKey) return activeKey;
  if (!activePath) return 'dashboard';

  const direct = ADMIN_SIDEBAR_MENU.find((i) => i.path && i.path === activePath);
  if (direct?.key) return direct.key;

  // For unknown admin subroutes, keep Dashboard highlighted like the reference.
  if (String(activePath).startsWith('/admin')) return 'dashboard';

  return 'dashboard';
}

function AdminSidebar({ activeKey, activePath, onNavigate, width = 240, title = 'Hotspot System' }) {
  const resolvedActiveKey = resolveActiveKey({ activeKey, activePath });

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <div className={styles.brand}>
        <div className={styles.brandTitle}>{title}</div>
      </div>

      <nav className={styles.nav} aria-label="Admin sidebar">
        {ADMIN_SIDEBAR_MENU.map((item) => (
          <AdminSidebarItem
            key={item.key}
            item={item}
            isActive={item.key === resolvedActiveKey}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </aside>
  );
}

export default memo(AdminSidebar);
