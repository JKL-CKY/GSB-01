const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, forbidden, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');
const { parsePagination, parseSort } = require('../utils/list');
const { toCSV } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const MONTH_RE = /^\d{4}-\d{2}$/;
const SORT_WHITELIST = {
  month: 'p.month',
  net_salary: 'p.net_salary',
  base_salary: 'p.base_salary',
};

function round2(n) { return Math.round(n * 100) / 100; }

function calcNet(p) {
  return round2(
    (+p.baseSalary || 0) + (+p.performance || 0) + (+p.subsidy || 0)
    - (+p.socialInsurance || 0) - (+p.housingFund || 0) - (+p.tax || 0)
  );
}

// 列表：管理端可按月份/员工/关键字；员工只能看自己
router.get('/', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const sort = parseSort(req.query, SORT_WHITELIST, 'p.month DESC, e.id ASC');
  const where = [];
  const params = { limit, offset };
  if (req.auth.role === 'employee') {
    where.push('p.employee_id = @selfId');
    params.selfId = req.auth.employee_id;
  } else if (req.query.keyword) {
    where.push('(e.name LIKE @kw OR e.emp_no LIKE @kw)');
    params.kw = `%${String(req.query.keyword).trim()}%`;
  }
  if (req.query.month && MONTH_RE.test(req.query.month)) { where.push('p.month = @month'); params.month = req.query.month; }
  if (req.query.departmentId) {
    where.push('e.department_id = @departmentId');
    params.departmentId = parseInt(req.query.departmentId, 10);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM payrolls p
    JOIN employees e ON e.id = p.employee_id ${whereSql}`).get(params).c;
  const list = db.prepare(`
    SELECT p.*, e.name AS employee_name, e.emp_no, d.name AS department_name
    FROM payrolls p
    JOIN employees e ON e.id = p.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    ${whereSql} ORDER BY ${sort} LIMIT @limit OFFSET @offset
  `).all(params);
  res.json({ total, page, pageSize, list });
});

// 工资单详情（员工只能看自己的）
router.get('/:id', asyncHandler((req, res) => {
  const row = db.prepare(`
    SELECT p.*, e.name AS employee_name, e.emp_no, d.name AS department_name
    FROM payrolls p JOIN employees e ON e.id = p.employee_id
    LEFT JOIN departments d ON d.id = e.department_id WHERE p.id = ?
  `).get(parseInt(req.params.id, 10));
  if (!row) throw notFound('工资单不存在');
  if (req.auth.role === 'employee' && row.employee_id !== req.auth.employee_id) throw forbidden();
  res.json(row);
}));

// 新建 / 编辑单条工资单（薪资修改留痕）
function upsertPayroll(req, id) {
  const b = req.body || {};
  if (!MONTH_RE.test(b.month || '')) throw badRequest('月份格式应为 YYYY-MM');
  if (!b.employeeId) throw badRequest('请选择员工');
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(b.employeeId);
  if (!emp) throw badRequest('员工不存在');
  const payload = {
    employeeId: b.employeeId, month: b.month,
    baseSalary: +b.baseSalary || 0, performance: +b.performance || 0, subsidy: +b.subsidy || 0,
    socialInsurance: +b.socialInsurance || 0, housingFund: +b.housingFund || 0, tax: +b.tax || 0,
  };
  payload.netSalary = calcNet(payload);
  return { payload, emp };
}

router.post('/', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const { payload, emp } = upsertPayroll(req);
  const dup = db.prepare('SELECT id FROM payrolls WHERE employee_id=? AND month=?').get(payload.employeeId, payload.month);
  if (dup) throw conflict(`${emp.name} 在 ${payload.month} 已存在工资单，请直接编辑`);
  const info = db.prepare(`
    INSERT INTO payrolls (employee_id, month, base_salary, performance, subsidy,
      social_insurance, housing_fund, tax, net_salary, status)
    VALUES (@employeeId, @month, @baseSalary, @performance, @subsidy,
      @socialInsurance, @housingFund, @tax, @netSalary, 'confirmed')
  `).run(payload);
  writeAudit(req, 'payroll.create', info.lastInsertRowid,
    `生成工资单：${emp.name} ${payload.month}，实发 ${payload.netSalary}`);
  res.json({ id: info.lastInsertRowid, message: '工资单已保存' });
}));

router.put('/:id', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const old = db.prepare('SELECT * FROM payrolls WHERE id = ?').get(id);
  if (!old) throw notFound('工资单不存在');
  const { payload, emp } = upsertPayroll(req);
  const dup = db.prepare('SELECT id FROM payrolls WHERE employee_id=? AND month=? AND id != ?')
    .get(payload.employeeId, payload.month, id);
  if (dup) throw conflict(`${emp.name} 在 ${payload.month} 已存在另一张工资单`);
  db.prepare(`
    UPDATE payrolls SET base_salary=@baseSalary, performance=@performance, subsidy=@subsidy,
      social_insurance=@socialInsurance, housing_fund=@housingFund, tax=@tax,
      net_salary=@netSalary WHERE id=@id
  `).run({ ...payload, id });
  writeAudit(req, 'payroll.update', id,
    `修改工资单：${emp.name} ${old.month}，实发 ${old.net_salary} → ${payload.netSalary}`);
  res.json({ message: '工资单已更新' });
}));

// 批量生成某月工资单（按当前基本工资生成，已存在的跳过）
router.post('/batch-generate', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const month = (req.body || {}).month;
  if (!month || !MONTH_RE.test(month)) throw badRequest('月份格式应为 YYYY-MM');
  const emps = db.prepare("SELECT id, base_salary FROM employees WHERE status != 'resigned'").all();
  const insert = db.prepare(`
    INSERT INTO payrolls (employee_id, month, base_salary, performance, subsidy,
      social_insurance, housing_fund, tax, net_salary, status)
    VALUES (@id, @month, @base, @perf, 500, @social, @fund, @tax, @net, 'confirmed')
    ON CONFLICT(employee_id, month) DO NOTHING
  `);
  let created = 0;
  const tx = db.transaction(() => {
    for (const e of emps) {
      const base = e.base_salary;
      const perf = round2(base * 0.15);
      const social = round2(base * 0.105);
      const fund = round2(base * 0.07);
      const taxable = base + perf + 500 - social - fund - 5000;
      let tax = 0;
      if (taxable > 0) {
        const b2 = [[3000, .03, 0], [12000, .1, 210], [25000, .2, 1410], [35000, .25, 2660], [55000, .3, 4410], [80000, .35, 7160], [Infinity, .45, 15160]];
        for (const [cap, rate, quick] of b2) if (taxable <= cap) { tax = round2(taxable * rate - quick); break; }
      }
      const net = round2(base + perf + 500 - social - fund - tax);
      const r = insert.run({ id: e.id, month, base, perf, social, fund, tax, net });
      if (r.changes) created++;
    }
  });
  tx();
  writeAudit(req, 'payroll.batchGenerate', month, `批量生成 ${month} 工资单，新增 ${created} 条（已存在的自动跳过），候选 ${emps.length} 人`);
  res.json({ message: `已生成 ${month} 工资单，新增 ${created} 条（已存在的自动跳过）`, created, skipped: emps.length - created });
}));

// 导出某月工资 CSV（带 BOM）
router.get('/export/csv', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT p.*, e.emp_no, e.name, d.name dept FROM payrolls p
    JOIN employees e ON e.id = p.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE p.month = ? ORDER BY e.id
  `).all(month);
  const csv = toCSV(
    ['工号', '姓名', '部门', '月份', '基本工资', '绩效', '补贴', '社保(个人)', '公积金(个人)', '个税', '实发工资'],
    rows.map((r) => [r.emp_no, r.name, r.dept, r.month, r.base_salary, r.performance, r.subsidy,
      r.social_insurance, r.housing_fund, r.tax, r.net_salary])
  );
  writeAudit(req, 'payroll.export', month, `导出 ${month} 工资单 ${rows.length} 条`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payroll_${month}.csv"`);
  res.send(csv);
}));

module.exports = router;
