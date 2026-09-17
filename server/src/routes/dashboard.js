const express = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const { asyncHandler } = require('../errors');

const router = express.Router();
router.use(authenticate);

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 仪表盘汇总数据 + 图表数据
router.get('/', asyncHandler((req, res) => {
  const total = db.prepare("SELECT COUNT(*) c FROM employees WHERE status != 'resigned'").get().c;
  const probation = db.prepare("SELECT COUNT(*) c FROM employees WHERE status = 'probation'").get().c;
  const resignedYear = db.prepare(
    "SELECT COUNT(*) c FROM employees WHERE status='resigned' AND leave_date >= date('now','-12 month')"
  ).get().c;
  const pendingLeave = db.prepare("SELECT COUNT(*) c FROM leave_requests WHERE status='pending'").get().c;
  const pendingRegular = db.prepare("SELECT COUNT(*) c FROM regular_requests WHERE status='pending'").get().c;
  const pendingAdjust = db.prepare("SELECT COUNT(*) c FROM salary_adjustments WHERE status='pending'").get().c;

  // 部门人数分布（含子部门员工）
  const depts = db.prepare('SELECT id, name, parent_id FROM departments ORDER BY sort_order, id').all();
  const counts = db.prepare(`
    SELECT department_id, COUNT(*) c FROM employees
    WHERE status != 'resigned' AND department_id IS NOT NULL GROUP BY department_id
  `).all();
  const countMap = Object.fromEntries(counts.map((r) => [r.department_id, r.c]));
  const deptDist = depts
    .filter((d) => d.parent_id === null)
    .map((d) => {
      let value = countMap[d.id] || 0;
      for (const child of depts.filter((x) => x.parent_id === d.id)) value += countMap[child.id] || 0;
      return { name: d.name, value };
    });

  // 近 6 个月入职 / 离职趋势
  const trend = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = monthKey(d);
    const hires = db.prepare(
      "SELECT COUNT(*) c FROM employees WHERE substr(hire_date,1,7) = ?"
    ).get(mk).c;
    const leaves = db.prepare(
      "SELECT COUNT(*) c FROM employees WHERE status='resigned' AND substr(leave_date,1,7) = ?"
    ).get(mk).c;
    trend.push({ month: mk, hires, leaves });
  }

  // 待办明细（管理端看全部；员工看自己的）
  const isManager = req.auth.role !== 'employee';
  let pendingApprovals = pendingLeave + pendingRegular + pendingAdjust;
  if (!isManager && req.auth.employee_id) {
    // 员工视角：本人正在审批流程中的申请数
    const myLeave = db.prepare("SELECT COUNT(*) c FROM leave_requests WHERE employee_id=? AND status='pending'").get(req.auth.employee_id).c;
    const myRegular = db.prepare("SELECT COUNT(*) c FROM regular_requests WHERE employee_id=? AND status='pending'").get(req.auth.employee_id).c;
    pendingApprovals = myLeave + myRegular;
  }
  let todoLeaveRows = [];
  if (isManager) {
    todoLeaveRows = db.prepare(`
      SELECT lr.id, lr.leave_type, lr.start_time, lr.duration, lr.status, e.name, e.emp_no
      FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
      WHERE lr.status='pending' ORDER BY lr.created_at LIMIT 8
    `).all();
  }

  res.json({
    stats: { total, probation, resignedYear, pendingApprovals },
    pending: { leave: pendingLeave, regular: pendingRegular, adjustment: pendingAdjust },
    deptDistribution: deptDist,
    hireLeaveTrend: trend,
    todoLeave: todoLeaveRows,
  });
}));

module.exports = router;
