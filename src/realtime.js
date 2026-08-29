import { config } from './config.js';
import { verifySessionToken } from './session.js';
import { roleCan } from './authz.js';
import { PERMISSIONS } from './roles.js';

let realtimeIo = null;

function cookieToken(cookieHeader, cookieName) {
  const source = typeof cookieHeader === 'string' ? cookieHeader : '';
  for (const part of source.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (name !== cookieName) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function extractSocketToken(handshake = {}, cookieName = config.sessionCookieName) {
  const authToken = typeof handshake.auth?.token === 'string' ? handshake.auth.token.trim() : '';
  if (authToken) return authToken;
  return cookieToken(handshake.headers?.cookie, cookieName);
}

export function socketRoomsForUser(user = {}) {
  const id = user.id == null ? '' : String(user.id);
  if (!/^\d+$/.test(id)) return [];
  const rooms = [`user:${id}`];
  if (roleCan(user.role, PERMISSIONS.DISPUTES)) rooms.push('admin:disputes');
  if (roleCan(user.role, PERMISSIONS.FINANCE)) rooms.push('admin:finance');
  if (roleCan(user.role, PERMISSIONS.SECURITY)) rooms.push('admin:security');
  return rooms;
}

export function configureRealtime(io) {
  realtimeIo = io;
  io.use((socket, next) => {
    const token = extractSocketToken(socket.handshake);
    const user = verifySessionToken(token);
    if (!user?.id) return next(new Error('authentication_required'));
    socket.data.user = user;
    return next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    for (const room of socketRoomsForUser(user)) socket.join(room);
    socket.emit('system:hello', {
      ok: true,
      service: 'kotakas',
      sourceMode: true,
      authenticated: true,
      userId: String(user.id),
      role: user.role,
    });
  });
}

function audienceOperator(rooms = []) {
  if (!realtimeIo) return null;
  const unique = [...new Set(rooms.filter(Boolean))];
  if (!unique.length) return null;
  let operator = realtimeIo.to(unique[0]);
  for (const room of unique.slice(1)) operator = operator.to(room);
  return operator;
}

export function publishAdminNotification(notification) {
  if (!notification) return false;
  const operator = audienceOperator(['admin:disputes']);
  if (!operator) return false;
  operator.emit('admin:notification', { notification });
  return true;
}

export function publishAdminNotificationRead(notification) {
  if (!notification) return false;
  const operator = audienceOperator(['admin:disputes']);
  if (!operator) return false;
  operator.emit('admin:notification-read', { notification });
  return true;
}

export function publishUserNotification(notification) {
  const userId = notification?.userId == null ? '' : String(notification.userId);
  if (!/^\d+$/.test(userId)) return false;
  const operator = audienceOperator([`user:${userId}`]);
  if (!operator) return false;
  operator.emit('user:notification', { notification });
  return true;
}

export function publishUserNotificationRead(notification) {
  const userId = notification?.userId == null ? '' : String(notification.userId);
  if (!/^\d+$/.test(userId)) return false;
  const operator = audienceOperator([`user:${userId}`]);
  if (!operator) return false;
  operator.emit('user:notification-read', { notification });
  return true;
}

export function publishUserNotificationsReadAll(userId) {
  const id = userId == null ? '' : String(userId);
  if (!/^\d+$/.test(id)) return false;
  const operator = audienceOperator([`user:${id}`]);
  if (!operator) return false;
  operator.emit('user:notifications-read-all', { userId: id });
  return true;
}

export function publishDisputeMessage({ message, buyerId, sellerId }) {
  if (!message) return false;
  const rooms = ['admin:disputes'];
  for (const id of [buyerId, sellerId]) {
    const text = id == null ? '' : String(id);
    if (/^\d+$/.test(text)) rooms.push(`user:${text}`);
  }
  const operator = audienceOperator(rooms);
  if (!operator) return false;
  operator.emit('dispute:message', { disputeId: String(message.disputeId), message });
  return true;
}

export function publishDisputeResolved({ dispute, buyerId, sellerId }) {
  if (!dispute) return false;
  const rooms = ['admin:disputes'];
  for (const id of [buyerId, sellerId]) {
    const text = id == null ? '' : String(id);
    if (/^\d+$/.test(text)) rooms.push(`user:${text}`);
  }
  const operator = audienceOperator(rooms);
  if (!operator) return false;
  operator.emit('dispute:resolved', { dispute });
  return true;
}
