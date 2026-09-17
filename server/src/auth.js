const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { unauthorized, forbidden } = require('./errors');

function signToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role, employee_id: user.employee_id },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// 解析 token，挂载 req.auth
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT id, username, role, employee_id, status FROM users WHERE id = ?').get(payload.uid);
    if (!user || user.status !== 'active') return next(unauthorized('账号已停用，请联系管理员'));
    req.auth = user;
    next();
  } catch (e) {
    next(unauthorized('登录状态已失效，请重新登录'));
  }
}

// 角色限制：requireRole('admin') / requireRole('admin','hr')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(forbidden('当前角色无权访问该功能'));
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole };
