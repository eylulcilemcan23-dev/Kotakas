export const ROLES = Object.freeze({
  OWNER: 'admin_owner',
  ADMIN: 'admin_full',
  LIMITED: 'admin_limited',
  TRADER: 'trader',
  USER: 'user',
});

export const PERMISSIONS = Object.freeze({
  MEMBERS: 'members',
  TRADERS: 'traders',
  APPLICATIONS: 'applications',
  LISTINGS: 'listings',
  DISPUTES: 'disputes',
  SUPPORT: 'support',
  WALLET: 'wallet',
  FINANCE: 'finance',
  COMMISSION: 'commission',
  ADMIN_MANAGEMENT: 'admin_management',
  SECURITY: 'security',
  PLATFORM_SETTINGS: 'platform_settings',
});

const adminBase = [
  PERMISSIONS.MEMBERS,
  PERMISSIONS.TRADERS,
  PERMISSIONS.APPLICATIONS,
  PERMISSIONS.LISTINGS,
  PERMISSIONS.DISPUTES,
  PERMISSIONS.SUPPORT,
];

const adminSensitive = [
  PERMISSIONS.WALLET,
  PERMISSIONS.FINANCE,
  PERMISSIONS.COMMISSION,
  PERMISSIONS.ADMIN_MANAGEMENT,
  PERMISSIONS.SECURITY,
  PERMISSIONS.PLATFORM_SETTINGS,
];

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.OWNER]: new Set([...adminBase, ...adminSensitive]),
  [ROLES.ADMIN]: new Set([...adminBase, ...adminSensitive]),
  [ROLES.LIMITED]: new Set(adminBase),
  [ROLES.TRADER]: new Set(),
  [ROLES.USER]: new Set(),
});

export function normalizeRole(value) {
  if (!value) return ROLES.USER;
  if (value === 'admin') return ROLES.ADMIN;
  return Object.values(ROLES).includes(value) ? value : ROLES.USER;
}

export function hasPermission(role, permission) {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized]?.has(permission) || false;
}

export function publicRoleMatrix() {
  return Object.fromEntries(
    Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => [role, [...permissions]]),
  );
}
