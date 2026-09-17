const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');
const { parsePagination, parseSort } = require('../utils/list');
const { seedDatabase } = require('../seed');

const router = express.Router();
router.use(authenticate);

/* ---------------- 用户管理（仅管理员） ---------------- */
router.use('/users', requireRole('admin'));

router.get('/users', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const sort = parseSort(req.query, { id: 'u.id', username: 'u.username', created_at: 'u.created_at' }, 'u.id ASC');
  const where = [];
  const params = { limit, offset };
  if (req.query.keyword) { where.push('(u.username LIKE @kw OR e.name LIKE @kw)'); params.kw = `%${req.query.keyword}%`; }
  if (req.query.role) { where.push('u.role = @role'); params.role = req.query.role; }
  if (req.query.status) { where.push('u.status = @status'); params.status = req.query.status; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM users u LEFT JOIN employees e ON e.id=u.employee_id ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT u.id, u.username, u.role, u.employee_id, u.status, u.created_at, e.name employee_name
    FROM users u LEFT JOIN employees e ON e.id=u.employee_id
    ${whereSql} ORDER BY ${sort} LIMIT @limit OFFSET @offset
  `).all(params);
  res.json({ total, page, pageSize, list });
});

router.post('/users', asyncHandler((req, res) => {
  const { username, password, role, employeeId } = req.body || {};
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw badRequest('用户名需为 3-20 位字母、数字或下划线');
  if (!password || String(password).length < 8) throw badRequest('密码长度至少 8 位');
  if (!['admin', 'hr', 'employee'].includes(role)) throw badRequest('角色不合法');
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) throw conflict('用户名已存在');
  if (role === 'employee') {
    if (!employeeId) throw badRequest('员工账号必须关联员工档案');
    const emp = db.prepare('SELECT id FROM employees WHERE id=?').get(employeeId);
    if (!emp) throw badRequest('关联的员工档案不存在');
    if (db.prepare('SELECT id FROM users WHERE employee_id=?').get(employeeId)) throw conflict('该员工已有关联账号');
  }
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, role, employee_id, status) VALUES (?, ?, ?, ?, ?)'
  ).run(username, bcrypt.hashSync(String(password), 10), role, role === 'employee' ? employeeId : null, 'active');
  writeAudit(req, 'user.create', info.lastInsertRowid, `新建用户：${username}，角色 ${role}`);
  res.json({ id: info.lastInsertRowid, message: '用户创建成功' });
}));

router.put('/users/:id', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) throw notFound('用户不存在');
  const b = req.body || {};
  let role = user.role;
  let employeeId = user.employee_id;
  if (b.role) {
    if (!['admin', 'hr', 'employee'].includes(b.role)) throw badRequest('角色不合法');
    role = b.role;
    employeeId = role === 'employee' ? (b.employeeId ?? user.employee_id) : null;
    if (role === 'employee') {
      if (!employeeId) throw badRequest('员工账号必须关联员工档案');
      const dup = db.prepare('SELECT id FROM users WHERE employee_id=? AND id!=?').get(employeeId, id);
      if (dup) throw conflict('该员工已有关联账号');
    }
  }
  const status = ['active', 'disabled'].includes(b.status) ? b.status : user.status;
  if (id === req.auth.id && status === 'disabled') throw badRequest('不能停用当前登录的自己');
  db.prepare('UPDATE users SET role=?, employee_id=?, status=? WHERE id=?').run(role, employeeId, status, id);
  writeAudit(req, 'user.update', id, `编辑用户：${user.username}，角色 ${user.role}→${role}，状态 ${status}`);
  res.json({ message: '用户已更新' });
}));

// 重置密码（管理员）
router.post('/users/:id/reset-password', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) throw notFound('用户不存在');
  const password = (req.body || {}).password;
  if (!password || String(password).length < 8) throw badRequest('新密码长度至少 8 位');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), id);
  writeAudit(req, 'user.resetPassword', id, `重置用户密码：${user.username}`);
  res.json({ message: '密码已重置' });
}));

// 启停用（权限变更类操作，前端二次确认 + 审计）
router.post('/users/:id/toggle', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) throw notFound('用户不存在');
  if (id === req.auth.id) throw badRequest('不能停用当前登录的自己');
  const next = user.status === 'active' ? 'disabled' : 'active';
  db.prepare('UPDATE users SET status=? WHERE id=?').run(next, id);
  writeAudit(req, 'user.toggle', id, `${next === 'disabled' ? '停用' : '启用'}用户：${user.username}`);
  res.json({ message: next === 'disabled' ? '已停用' : '已启用', status: next });
}));

/* ---------------- 审计日志（仅管理员，只读） ---------------- */
router.get('/audit-logs', requireRole('admin'), (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const sort = parseSort(req.query, { id: 'id', created_at: 'created_at', action: 'action', username: 'username' }, 'id DESC');
  const where = [];
  const params = { limit, offset };
  if (req.query.keyword) {
    where.push('(action LIKE @kw OR username LIKE @kw OR target LIKE @kw OR detail LIKE @kw)');
    params.kw = `%${String(req.query.keyword).trim()}%`;
  }
  if (req.query.action) { where.push('action = @action'); params.action = req.query.action; }
  if (req.query.startDate) { where.push('date(created_at) >= @startDate'); params.startDate = req.query.startDate; }
  if (req.query.endDate) { where.push('date(created_at) <= @endDate'); params.endDate = req.query.endDate; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_logs ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT * FROM audit_logs ${whereSql} ORDER BY ${sort} LIMIT @limit OFFSET @offset
  `).all(params);
  // 操作类型集合（给前端做筛选下拉）
  const actions = db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all().map((r) => r.action);
  res.json({ total, page, pageSize, list, actions });
});

/* ---------------- 一键重置演示数据（仅管理员） ---------------- */
router.post('/reset-demo', requireRole('admin'), asyncHandler((req, res) => {
  const count = seedDatabase();
  writeAudit({ auth: req.auth, ip: req.ip }, 'system.resetDemo', '全部数据', `一键重置演示数据，员工 ${count.employees} 人`);
  res.json({ message: '演示数据已重置为初始状态', employees: count.employees });
}));

module.exports = router;
