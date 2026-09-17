const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authenticate } = require('../auth');
const { badRequest, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');

const router = express.Router();

// 登录
router.post('/login', asyncHandler((req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw badRequest('请输入用户名和密码');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  // 用户名与密码错误返回相同提示，避免账号枚举
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ code: 'LOGIN_FAILED', message: '用户名或密码不正确' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ code: 'ACCOUNT_DISABLED', message: '账号已停用，请联系管理员' });
  }

  const emp = user.employee_id
    ? db.prepare('SELECT id, name, department_id, position_id, status FROM employees WHERE id = ?').get(user.employee_id)
    : null;

  writeAudit({ auth: user, ip: req.ip }, 'auth.login', user.username, '用户登录');
  res.json({
    token: signToken(user),
    user: {
      id: user.id, username: user.username, role: user.role,
      employeeId: user.employee_id || null,
      name: emp ? emp.name : { admin: '系统管理员', hr: 'HR 专员' }[user.role] || user.username,
      deptId: emp ? emp.department_id : null,
    },
  });
}));

// 当前登录人信息
router.get('/me', authenticate, (req, res) => {
  const u = req.auth;
  const emp = u.employee_id
    ? db.prepare(`SELECT e.id, e.name, e.phone, e.email, e.emergency_contact, e.emergency_phone,
                         e.address, e.department_id, e.position_id, e.avatar_color
                  FROM employees e WHERE e.id = ?`).get(u.employee_id)
    : null;
  res.json({
    id: u.id, username: u.username, role: u.role,
    name: emp ? emp.name : { admin: '系统管理员', hr: 'HR 专员' }[u.role] || u.username,
    avatarColor: emp ? emp.avatar_color : '#409EFF',
    employee: emp,
  });
});

// 修改自己的密码（需验证旧密码）
router.post('/change-password', authenticate, asyncHandler((req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) throw badRequest('请填写旧密码与新密码');
  if (String(newPassword).length < 8) throw badRequest('新密码长度至少 8 位');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!bcrypt.compareSync(String(oldPassword), user.password_hash)) {
    throw badRequest('旧密码不正确');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(newPassword), 10), user.id);
  writeAudit(req, 'auth.changePassword', user.username, '用户修改自己的登录密码');
  res.json({ message: '密码修改成功' });
}));

module.exports = router;
