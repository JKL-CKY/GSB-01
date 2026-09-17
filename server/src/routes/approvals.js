const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');
const { parsePagination } = require('../utils/list');

const router = express.Router();
router.use(authenticate);

/* ---------------- 转正申请 ---------------- */

router.get('/regular', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const where = [];
  const params = { limit, offset };
  if (req.auth.role === 'employee') { where.push('rr.employee_id = @selfId'); params.selfId = req.auth.employee_id; }
  else if (req.query.status) { where.push('rr.status = @status'); params.status = req.query.status; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM regular_requests rr
    JOIN employees e ON e.id=rr.employee_id ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT rr.*, e.name employee_name, e.emp_no, d.name department_name, u.username approver_name
    FROM regular_requests rr
    JOIN employees e ON e.id=rr.employee_id
    LEFT JOIN departments d ON d.id=e.department_id
    LEFT JOIN users u ON u.id=rr.approver_id
    ${whereSql} ORDER BY rr.updated_at DESC, rr.id DESC LIMIT @limit OFFSET @offset
  `).all(params);
  res.json({ total, page, pageSize, list });
});

// 提交转正申请（HR 代员工发起 或 试用期员工为自己发起）
router.post('/regular', asyncHandler((req, res) => {
  const b = req.body || {};
  const employeeId = req.auth.role === 'employee' ? req.auth.employee_id : parseInt(b.employeeId, 10);
  if (!employeeId) throw badRequest('请选择员工');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expectedDate || '')) throw badRequest('期望转正日期格式不正确');
  const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(employeeId);
  if (!emp) throw notFound('员工不存在');
  if (emp.status !== 'probation') throw conflict('仅试用期员工可以提交转正申请');
  const pending = db.prepare("SELECT id FROM regular_requests WHERE employee_id=? AND status='pending'").get(employeeId);
  if (pending) throw conflict('该员工已有待审批的转正申请');
  const info = db.prepare(
    'INSERT INTO regular_requests (employee_id, expected_date, remark, status) VALUES (?, ?, ?, ?)'
  ).run(employeeId, b.expectedDate, (b.remark || '').trim(), 'pending');
  writeAudit(req, 'regular.create', info.lastInsertRowid, `提交转正申请：${emp.name}，期望日期 ${b.expectedDate}`);
  res.json({ id: info.lastInsertRowid, message: '转正申请已提交' });
}));

router.post('/regular/:id/approve', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM regular_requests WHERE id=?').get(id);
  if (!row) throw notFound('转正申请不存在');
  if (row.status !== 'pending') throw conflict('该申请不在待审批状态');
  const pass = req.body && req.body.pass === true;
  const remark = (req.body && req.body.remark || '').trim();
  const tx = db.transaction(() => {
    db.prepare('UPDATE regular_requests SET status=?, approver_id=?, approve_remark=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(pass ? 'approved' : 'rejected', req.auth.id, remark, id);
    if (pass) {
      db.prepare("UPDATE employees SET status='regular', updated_at=datetime('now','localtime') WHERE id=?")
        .run(row.employee_id);
    }
  });
  tx();
  const emp = db.prepare('SELECT name FROM employees WHERE id=?').get(row.employee_id);
  writeAudit(req, 'regular.approve', id, `转正审批：${emp.name} ${pass ? '通过（员工状态已变更为正式）' : '驳回'}，意见：${remark || '无'}`);
  res.json({ message: pass ? '已通过转正，员工状态已更新' : '已驳回' });
}));

/* ---------------- 调薪申请 ---------------- */

router.get('/adjustment', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const where = [];
  const params = { limit, offset };
  if (req.auth.role === 'employee') { where.push('sa.employee_id = @selfId'); params.selfId = req.auth.employee_id; }
  else if (req.query.status) { where.push('sa.status = @status'); params.status = req.query.status; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM salary_adjustments sa
    JOIN employees e ON e.id=sa.employee_id ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT sa.*, e.name employee_name, e.emp_no, d.name department_name, u.username approver_name
    FROM salary_adjustments sa
    JOIN employees e ON e.id=sa.employee_id
    LEFT JOIN departments d ON d.id=e.department_id
    LEFT JOIN users u ON u.id=sa.approver_id
    ${whereSql} ORDER BY sa.updated_at DESC, sa.id DESC LIMIT @limit OFFSET @offset
  `).all(params);
  res.json({ total, page, pageSize, list });
});

router.post('/adjustment', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const b = req.body || {};
  const employeeId = parseInt(b.employeeId, 10);
  const newSalary = Number(b.newSalary);
  if (!employeeId) throw badRequest('请选择员工');
  if (!Number.isFinite(newSalary) || newSalary <= 0) throw badRequest('调薪后薪资必须大于 0');
  if (!/^\d{4}-\d{2}$/.test(b.effectiveMonth || '')) throw badRequest('生效月份格式应为 YYYY-MM');
  const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(employeeId);
  if (!emp) throw notFound('员工不存在');
  if (emp.status === 'resigned') throw conflict('已离职员工不能调薪');
  if (newSalary === emp.base_salary) throw badRequest('新薪资与当前薪资相同，无需调薪');
  const info = db.prepare(`
    INSERT INTO salary_adjustments (employee_id, old_salary, new_salary, effective_month, reason, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(employeeId, emp.base_salary, newSalary, b.effectiveMonth, (b.reason || '').trim());
  writeAudit(req, 'adjustment.create', info.lastInsertRowid,
    `发起调薪：${emp.name} ${emp.base_salary} → ${newSalary}，生效月份 ${b.effectiveMonth}`);
  res.json({ id: info.lastInsertRowid, message: '调薪申请已提交，等待管理员审批' });
}));

router.post('/adjustment/:id/approve', requireRole('admin'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM salary_adjustments WHERE id=?').get(id);
  if (!row) throw notFound('调薪申请不存在');
  if (row.status !== 'pending') throw conflict('该申请不在待审批状态');
  const pass = req.body && req.body.pass === true;
  const remark = (req.body && req.body.remark || '').trim();
  const tx = db.transaction(() => {
    db.prepare('UPDATE salary_adjustments SET status=?, approver_id=?, approve_remark=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(pass ? 'approved' : 'rejected', req.auth.id, remark, id);
    if (pass) {
      db.prepare('UPDATE employees SET base_salary=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
        .run(row.new_salary, row.employee_id);
    }
  });
  tx();
  const emp = db.prepare('SELECT name FROM employees WHERE id=?').get(row.employee_id);
  writeAudit(req, 'adjustment.approve', id,
    `调薪审批：${emp.name} ${pass ? `通过，基本工资已更新为 ${row.new_salary}` : '驳回'}，意见：${remark || '无'}`);
  res.json({ message: pass ? '调薪已通过，基本工资已更新' : '已驳回' });
}));

module.exports = router;
