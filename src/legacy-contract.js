import { PERMISSIONS } from './roles.js';

export const LIVE_API_CONTRACT = Object.freeze([
  { method: 'GET', path: '/api/listings', access: 'public' },
  { method: 'GET', path: '/api/stats', access: 'public' },
  { method: 'GET', path: '/api/requests', access: 'public' },
  { method: 'GET', path: '/api/me', access: 'user' },
  { method: 'GET', path: '/api/notifications', access: 'user' },
  { method: 'GET', path: '/api/transactions', access: 'user' },
  { method: 'GET', path: '/api/tickets', access: 'user' },
  { method: 'GET', path: '/api/admin/overview', access: 'admin', permission: PERMISSIONS.MEMBERS },
  { method: 'GET', path: '/api/admin/users', access: 'admin', permission: PERMISSIONS.MEMBERS },
  { method: 'GET', path: '/api/admin/traders', access: 'admin', permission: PERMISSIONS.TRADERS },
  { method: 'GET', path: '/api/admin/trader-applications', access: 'admin', permission: PERMISSIONS.APPLICATIONS },
  { method: 'GET', path: '/api/admin/listings', access: 'admin', permission: PERMISSIONS.LISTINGS },
  { method: 'GET', path: '/api/admin/wallets', access: 'admin', permission: PERMISSIONS.WALLET },
  { method: 'GET', path: '/api/admin/commissions', access: 'admin', permission: PERMISSIONS.COMMISSION },
  { method: 'GET', path: '/api/admin/disputes', access: 'admin', permission: PERMISSIONS.DISPUTES },
  { method: 'GET', path: '/api/admin/security-events', access: 'admin', permission: PERMISSIONS.SECURITY },
  { method: 'GET', path: '/api/admin/settings', access: 'admin', permission: PERMISSIONS.PLATFORM_SETTINGS },
  { method: 'GET', path: '/api/admin/market-rates', access: 'admin', permission: PERMISSIONS.FINANCE },
]);

export function findLiveContract(path, method = 'GET') {
  const targetMethod = String(method || 'GET').toUpperCase();
  return LIVE_API_CONTRACT.find((item) => item.path === path && item.method === targetMethod) || null;
}
