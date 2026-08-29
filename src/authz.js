import { hasPermission, normalizeRole, ROLES } from './roles.js';

export function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return [ROLES.OWNER, ROLES.ADMIN, ROLES.LIMITED].includes(normalized);
}

export function roleCan(role, permission) {
  return hasPermission(normalizeRole(role), permission);
}

export function requireAuthenticated(req, res, next) {
  if (!req.user && !req.auth) {
    return res.status(401).json({ ok: false, error: 'authentication_required' });
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.user?.role || req.auth?.role;
    if (!role) return res.status(401).json({ ok: false, error: 'authentication_required' });
    if (!roleCan(role, permission)) {
      return res.status(403).json({ ok: false, error: 'forbidden', permission });
    }
    next();
  };
}
