const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, forbidden, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');
const { parsePagination, parseSort } = require('../utils/list');
const { toCSV } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const LEAVE_TYPES = ['sick', 'personal', 'annual', 'marriage', 'maternity', 'other'];
const SORT_WHITELIST = {
  created_at: 'lr.created_at',
  start_time: 'lr.start_time',
  duration: 'lr.duration',
};

function loadLeave(id) {
  return db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.emp_no, d.name AS department_name
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE lr.id = ?
  `).get(id);
}

// 列表：员工看自己；管理端看全部，支持状态/类型/关键字/排序
router.get('/', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const sort = parseSort(req.query, SORT_WHITELIST, 'lr.updated_at DESC, lr.id DESC');
  const where = [];
  const params = { limit, offset };

  if (req.auth.role === 'employee') {
    where.push('lr.employee_id = @selfId');
    params.selfId = req.auth.employee_id;
  } else {
    if (req.query.status) { where.push('lr.status = @status'); params.status = req.query.status; }
    if (req.query.leaveType) { where.push('lr.leave_type = @leaveType'); params.leaveType = req.query.leaveType; }
    if (req.query.keyword) {
      where.push('(e.name LIKE @kw OR e.emp_no LIKE @kw)');
      params.kw = `%${String(req.query.keyword).trim()}%`;
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.emp_no, d.name AS department_name,
           u.username AS approver_name
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN users u ON u.id = lr.approver_id
    ${whereSql} ORDER BY ${sort} LIMIT @limit OFFSET @offset
  `).all(params);
  res.json({ total, page, pageSize, list });
});

// 导出当前筛选结果 CSV（带 BOM）
router.get('/export', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const where = [];
  const params = {};
  if (req.query.status) { where.push('lr.status = @status'); params.status = req.query.status; }
  if (req.query.leaveType) { where.push('lr.leave_type = @leaveType'); params.leaveType = req.query.leaveType; }
  if (req.query.keyword) { where.push('(e.name LIKE @kw OR e.emp_no LIKE @kw)'); params.kw = `%${req.query.keyword}%`; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT e.emp_no, e.name, d.name dept, lr.leave_type, lr.start_time, lr.end_time,
           lr.duration, lr.reason, lr.status, lr.approve_remark, u.username approver
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN users u ON u.id = lr.approver_id
    ${whereSql} ORDER BY lr.id DESC
  `).all(params);
  const typeMap = { sick: '病假', personal: '事假', annual: '年假', marriage: '婚假', maternity: '产假', other: '其他' };
  const statusMap = { draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回', cancelled: '已撤销' };
  const csv = toCSV(
    ['工号', '姓名', '部门', '类型', '开始时间', '结束时间', '天数', '事由', '状态', '审批意见', '审批人'],
    rows.map((r) => [r.emp_no, r.name, r.dept, typeMap[r.leave_type], r.start_time, r.end_time,
      r.duration, r.reason, statusMap[r.status], r.approve_remark || '', r.approver || ''])
  );
  writeAudit(req, 'leave.export', `筛选 ${JSON.stringify(req.query)}`, `导出请假 ${rows.length} 条`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leave_${Date.now()}.csv"`);
  res.send(csv);
}));

// 详情
router.get('/:id', asyncHandler((req, res) => {
  const row = loadLeave(parseInt(req.params.id, 10));
  if (!row) throw notFound('请假单不存在');
  if (req.auth.role === 'employee' && row.employee_id !== req.auth.employee_id) throw forbidden();
  res.json(row);
}));

function validateLeaveBody(b) {
  if (!LEAVE_TYPES.includes(b.leaveType)) throw badRequest('请假类型不合法');
  if (!b.startTime || !b.endTime) throw badRequest('请选择起止时间');
  if (new Date(b.endTime) <= new Date(b.startTime)) throw badRequest('结束时间必须晚于开始时间');
  const duration = Number(b.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw badRequest('请假时长必须大于 0');
  if (!b.reason || !String(b.reason).trim()) throw badRequest('请填写请假事由');
}

// 新建请假单（默认草稿，可直接提交）
router.post('/', asyncHandler((req, res) => {
  const b = req.body || {};
  validateLeaveBody(b);
  const employeeId = req.auth.role === 'employee' ? req.auth.employee_id : (b.employeeId || req.auth.employee_id);
  if (!employeeId) throw badRequest('未能确定请假员工');
  const submit = b.submit === true;
  const info = db.prepare(`
    INSERT INTO leave_requests (employee_id, leave_type, start_time, end_time, duration, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(employeeId, b.leaveType, b.startTime, b.endTime, Number(b.duration),
    String(b.reason).trim(), submit ? 'pending' : 'draft');
  writeAudit(req, 'leave.create', info.lastInsertRowid,
    `创建请假单，员工ID ${employeeId}，类型 ${b.leaveType}，${b.duration} 天，状态：${submit ? '待审批' : '草稿'}`);
  res.json({ id: info.lastInsertRowid, message: submit ? '请假申请已提交，等待审批' : '草稿已保存' });
}));

// 员工编辑自己的草稿 / 驳回单
router.put('/:id', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
  if (!row) throw notFound('请假单不存在');
  if (req.auth.role === 'employee' && row.employee_id !== req.auth.employee_id) throw forbidden();
  if (!['draft', 'rejected'].includes(row.status)) throw conflict('仅草稿或被驳回的申请可以修改');
  const b = req.body || {};
  validateLeaveBody(b);
  db.prepare(`
    UPDATE leave_requests SET leave_type=?, start_time=?, end_time=?, duration=?, reason=?,
      status=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(b.leaveType, b.startTime, b.endTime, Number(b.duration), String(b.reason).trim(),
    b.submit ? 'pending' : 'draft', id);
  writeAudit(req, 'leave.update', id, `修改请假单并${b.submit ? '重新提交审批' : '保存草稿'}`);
  res.json({ message: b.submit ? '已重新提交审批' : '草稿已更新' });
}));

// 草稿提交：draft -> pending
router.post('/:id/submit', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
  if (!row) throw notFound('请假单不存在');
  if (req.auth.role === 'employee' && row.employee_id !== req.auth.employee_id) throw forbidden();
  if (!['draft', 'rejected'].includes(row.status)) throw conflict('当前状态不允许提交');
  db.prepare("UPDATE leave_requests SET status='pending', updated_at=datetime('now','localtime') WHERE id=?").run(id);
  writeAudit(req, 'leave.submit', id, '提交请假审批');
  res.json({ message: '已提交，等待审批' });
}));

// 审批：pending -> approved/rejected（HR / 管理员）
router.post('/:id/approve', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = loadLeave(id);
  if (!row) throw notFound('请假单不存在');
  if (row.status !== 'pending') throw conflict('该申请不在待审批状态');
  const pass = req.body && req.body.pass === true;
  const remark = (req.body && req.body.remark || '').trim();
  db.prepare(`
    UPDATE leave_requests SET status=?, approver_id=?, approve_remark=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(pass ? 'approved' : 'rejected', req.auth.id, remark, id);

  // 通过后把请假区间内工作日的考勤标记为 leave
  if (pass) {
    const start = new Date(row.start_time.replace(' ', 'T'));
    const end = new Date(row.end_time.replace(' ', 'T'));
    const upsert = db.prepare(`
      INSERT INTO attendance (employee_id, work_date, check_in, check_out, status)
      VALUES (?, ?, NULL, NULL, 'leave')
      ON CONFLICT(employee_id, work_date) DO UPDATE SET status='leave', check_in=NULL, check_out=NULL
    `);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const w = d.getDay();
      if (w !== 0 && w !== 6) {
        upsert.run(row.employee_id, d.toISOString().slice(0, 10));
      }
    }
  }
  writeAudit(req, 'leave.approve', id, `请假审批：${pass ? '通过' : '驳回'}，审批意见：${remark || '无'}`);
  res.json({ message: pass ? '已审批通过' : '已驳回' });
}));

// 撤销已通过的申请（员工本人，开始时间之前）：approved -> cancelled
router.post('/:id/cancel', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
  if (!row) throw notFound('请假单不存在');
  if (req.auth.role === 'employee' && row.employee_id !== req.auth.employee_id) throw forbidden();
  if (row.status !== 'approved') throw conflict('仅审批通过的申请可以撤销');
  if (req.auth.role === 'employee' && new Date(row.start_time.replace(' ', 'T')) <= new Date()) {
    throw conflict('请假已开始，不能撤销，请联系 HR');
  }
  db.prepare("UPDATE leave_requests SET status='cancelled', updated_at=datetime('now','localtime') WHERE id=?").run(id);
  writeAudit(req, 'leave.cancel', id, '撤销已通过的请假申请');
  res.json({ message: '请假已撤销' });
}));

module.exports = router;
