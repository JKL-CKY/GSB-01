const express = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const { badRequest, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');
const { parsePagination, parseSort } = require('../utils/list');
const { toCSV } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const SORT_WHITELIST = { work_date: 'work_date', status: 'status' };

// 统一构造筛选条件
function buildFilter(req) {
  const where = [];
  const params = {};
  if (req.auth.role === 'employee') {
    where.push('a.employee_id = @selfId');
    params.selfId = req.auth.employee_id;
  } else if (req.query.employeeId) {
    where.push('a.employee_id = @employeeId');
    params.employeeId = parseInt(req.query.employeeId, 10);
  }
  if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
    where.push('substr(a.work_date,1,7) = @month');
    params.month = req.query.month;
  }
  if (req.query.status) { where.push('a.status = @status'); params.status = req.query.status; }
  return { where, params };
}

// 考勤列表：管理端可按人/月/状态筛选；员工只能看自己
router.get('/', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const sort = parseSort(req.query, SORT_WHITELIST, 'work_date DESC');
  const { where, params } = buildFilter(req);
  Object.assign(params, { limit, offset });
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM attendance a ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT a.*, e.name AS employee_name, e.emp_no, d.name AS department_name
    FROM attendance a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    ${whereSql} ORDER BY ${sort} LIMIT @limit OFFSET @offset
  `).all(params);

  // 月度汇总
  const month = req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  const sumParams = { month };
  let scopeSql = '';
  if (req.auth.role === 'employee') { scopeSql = 'AND employee_id = @selfId'; sumParams.selfId = req.auth.employee_id; }
  else if (req.query.employeeId) { scopeSql = 'AND employee_id = @employeeId'; sumParams.employeeId = parseInt(req.query.employeeId, 10); }
  const summary = db.prepare(`
    SELECT status, COUNT(*) c FROM attendance
    WHERE substr(work_date,1,7) = @month ${scopeSql}
    GROUP BY status
  `).all(sumParams);

  res.json({ total, page, pageSize, list, month, summary });
});

// 导出当前筛选结果 CSV（带 BOM）
router.get('/export', asyncHandler((req, res) => {
  const { where, params } = buildFilter(req);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT a.work_date, e.emp_no, e.name, d.name dept, a.check_in, a.check_out, a.status
    FROM attendance a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    ${whereSql} ORDER BY a.work_date DESC, e.id
  `).all(params);
  const statusMap = { normal: '正常', late: '迟到', early_leave: '早退', absent: '缺勤', leave: '请假' };
  const csv = toCSV(
    ['日期', '工号', '姓名', '部门', '上班打卡', '下班打卡', '状态'],
    rows.map((r) => [r.work_date, r.emp_no, r.name, r.dept, r.check_in || '', r.check_out || '', statusMap[r.status] || r.status])
  );
  writeAudit(req, 'attendance.export', `筛选 ${JSON.stringify(req.query)}`, `导出考勤 ${rows.length} 条`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance_${Date.now()}.csv"`);
  res.send(csv);
}));

module.exports = router;
