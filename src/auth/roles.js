export const ROLES = Object.freeze({
  ADMIN_OWNER: 'admin_owner',
  ADMIN_FULL: 'admin_full',
  ADMIN_LIMITED: 'admin_limited',
  TRADER: 'trader',
  USER: 'user'
});

const limitedAdminScopes = new Set([
  'members',
  'traders',
  'applications',
  'listings',
  'disputes',
  'support'
]);

export function isAdmin(role) {
  return [ROLES.ADMIN_OWNER, ROLES.ADMIN_FULL, ROLES.ADMIN_LIMITED].includes(role);
}

export function canAccessAdminScope(role, scope) {
  if (role === ROLES.ADMIN_OWNER || role === ROLES.ADMIN_FULL) return true;
  if (role === ROLES.ADMIN_LIMITED) return limitedAdminScopes.has(scope);
  return false;
}

export function requireAdminScope(scope) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!canAccessAdminScope(role, scope)) {
      return res.status(403).json({ ok: false, error: 'forbidden', scope });
    }
    next();
  };
}
