import { ROLES, isAdmin } from './roles.js';

export function landingPathForRole(role) {
  if (isAdmin(role)) return '/admin.html';
  if (role === ROLES.TRADER) return '/trader.html';
  return '/dashboard.html';
}

export function canAccessPanel(role, panel) {
  if (!role) return false;
  if (panel === 'admin') return isAdmin(role);
  if (panel === 'trader') return role === ROLES.TRADER;
  if (panel === 'user') return role === ROLES.USER;
  return false;
}

export function requirePanelPage(panel) {
  return (req, res, next) => {
    if (!req.user) {
      const nextPath = encodeURIComponent(req.originalUrl || req.path || '/');
      return res.redirect(302, `/login.html?next=${nextPath}`);
    }

    if (!canAccessPanel(req.user.role, panel)) {
      return res.status(403).send('Bu panele erişim yetkiniz yok.');
    }

    next();
  };
}

export function requireAdminApi(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'authentication_required' });
  if (!isAdmin(req.user.role)) return res.status(403).json({ ok: false, error: 'admin_required' });
  next();
}

export function requireTraderApi(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'authentication_required' });
  if (req.user.role !== ROLES.TRADER) return res.status(403).json({ ok: false, error: 'trader_required' });
  next();
}
