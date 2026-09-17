const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, forbidden, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');
const { parsePagination, parseSort } = require('../utils/list');
const { parseCSV, toCSV } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const SORT_WHITELIST = {
  id: 'e.id',
  emp_no: 'e.emp_no',
  name: 'e.name',
  hire_date: 'e.hire_date',
  created_at: 'e.created_at',
  base_salary: 'e.base_salary',
};

const SENSITIVE_FIELDS = ['id_card', 'base_salary', 'bank_account'];

function maskRow(e, canViewSensitive) {
  const row = { ...e };
  if (!canViewSensitive) {
    for (const f of SENSITIVE_FIELDS) delete row[f];
    if (row.id_card_masked === undefined) {
      // 列表里给个掩码便于辨识
    }
  }
  return row;
}

// 取部门及其所有子部门 id
function deptWithChildren(deptId) {
  const ids = [deptId];
  const all = db.prepare('SELECT id, parent_id FROM departments').all();
  let added = true;
  while (added) {
    added = false;
    for (const d of all) {
      if (d.parent_id && ids.includes(d.parent_id) && !ids.includes(d.id)) {
        ids.push(d.id);
        added = true;
      }
    }
  }
  return ids;
}

// 员工列表：分页 + 关键字 + 部门（含子部门）+ 状态 + 排序
router.get('/', (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const sort = parseSort(req.query, SORT_WHITELIST, 'e.id ASC');
  const canViewSensitive = req.auth.role === 'admin' || req.auth.role === 'hr';

  const where = [];
  const params = {};
  if (req.query.keyword) {
    where.push('(e.name LIKE @kw OR e.emp_no LIKE @kw OR e.phone LIKE @kw)');
    params.kw = `%${String(req.query.keyword).trim()}%`;
  }
  if (req.query.status) {
    if (!['probation', 'regular', 'resigned'].includes(req.query.status)) throw badRequest('状态参数不合法');
    where.push('e.status = @status');
    params.status = req.query.status;
  }
  if (req.query.departmentId) {
    const ids = deptWithChildren(parseInt(req.query.departmentId, 10));
    where.push(`e.department_id IN (${ids.map((_, i) => `@d${i}`).join(',')})`);
    ids.forEach((id, i) => { params[`d${i}`] = id; });
  }
  if (req.query.positionId) {
    where.push('e.position_id = @positionId');
    params.positionId = parseInt(req.query.positionId, 10);
  }
  // 普通员工：只能看到在职人员（组织名册），不暴露离职人员
  if (!canViewSensitive) where.push("e.status != 'resigned'");

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM employees e ${whereSql}`).get(params).c;
  const rows = db.prepare(`
    SELECT e.*, d.name AS department_name, p.name AS position_name
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    ${whereSql}
    ORDER BY ${sort}
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({
    total, page, pageSize,
    list: rows.map((r) => maskRow(r, canViewSensitive)),
  });
});

// 导出当前筛选结果为 CSV（带 BOM）
router.get('/export', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const where = [];
  const params = {};
  if (req.query.keyword) { where.push('(e.name LIKE @kw OR e.emp_no LIKE @kw)'); params.kw = `%${req.query.keyword}%`; }
  if (req.query.status) { where.push('e.status = @status'); params.status = req.query.status; }
  if (req.query.departmentId) {
    const ids = deptWithChildren(parseInt(req.query.departmentId, 10));
    where.push(`e.department_id IN (${ids.map((_, i) => `@d${i}`).join(',')})`);
    ids.forEach((id, i) => { params[`d${i}`] = id; });
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT e.emp_no, e.name, e.gender, d.name AS dept, p.name AS pos,
           e.phone, e.email, e.hire_date, e.leave_date, e.status,
           e.base_salary, e.id_card, e.bank_account, e.address
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    ${whereSql} ORDER BY e.id
  `).all(params);

  const genderMap = { male: '男', female: '女', unknown: '未知' };
  const statusMap = { probation: '试用期', regular: '正式', resigned: '已离职' };
  const csv = toCSV(
    ['工号', '姓名', '性别', '部门', '职位', '手机号', '邮箱', '入职日期', '离职日期', '状态', '基本工资', '身份证号', '银行账号', '住址'],
    rows.map((r) => [r.emp_no, r.name, genderMap[r.gender], r.dept, r.pos, r.phone, r.email,
      r.hire_date, r.leave_date || '', statusMap[r.status],
      r.base_salary, r.id_card, r.bank_account, r.address])
  );
  writeAudit(req, 'employee.export', `筛选条件：${JSON.stringify(req.query)}`, `导出员工 ${rows.length} 条`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="employees_${Date.now()}.csv"`);
  res.send(csv);
}));

// CSV 批量导入（先整表校验，全部通过才入库；出错精确到行号与字段）
router.post('/import', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const content = req.body && req.body.content;
  if (!content || typeof content !== 'string') throw badRequest('未收到 CSV 内容');

  const rows = parseCSV(content);
  if (rows.length < 2) throw badRequest('CSV 没有可导入的数据行（首行须为表头）');
  const header = rows[0].map((h) => h.trim());
  const required = ['姓名', '部门', '职位', '入职日期'];
  const colIndex = {};
  for (const name of ['工号', '姓名', '性别', '部门', '职位', '手机号', '入职日期', '基本工资', '邮箱']) {
    colIndex[name] = header.indexOf(name);
  }
  const headerErrors = required.filter((n) => colIndex[n] === -1).map((n) => ({ row: 1, field: n, message: `缺少必需列「${n}」` }));
  if (headerErrors.length) return res.status(400).json({ code: 'BAD_REQUEST', message: 'CSV 表头不符合要求', detail: headerErrors });

  const deptMap = new Map(db.prepare('SELECT id, name FROM departments').all().map((d) => [d.name, d.id]));
  const posMap = new Map(db.prepare('SELECT id, name FROM positions').all().map((p) => [p.name, p.id]));
  const genderMap = { 男: 'male', 女: 'female', 未知: 'unknown', male: 'male', female: 'female', '': 'unknown' };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  const errors = [];
  const parsed = [];
  const batchNos = new Set();
  rows.slice(1).forEach((cells, idx) => {
    const rowNo = idx + 2; // 表格行号（1 行表头 + 数据行）
    const get = (name) => (colIndex[name] === -1 ? '' : (cells[colIndex[name]] || '').trim());
    const addErr = (field, message) => errors.push({ row: rowNo, field, message });

    const name = get('姓名');
    if (!name) addErr('姓名', '姓名不能为空');
    const deptName = get('部门');
    const departmentId = deptMap.get(deptName);
    if (!deptName) addErr('部门', '部门不能为空');
    else if (!departmentId) addErr('部门', `部门「${deptName}」不存在，请先在组织管理中创建`);
    const posName = get('职位');
    const positionId = posMap.get(posName);
    if (!posName) addErr('职位', '职位不能为空');
    else if (!positionId) addErr('职位', `职位「${posName}」不存在，请先在职位管理中创建`);

    const hireDate = get('入职日期');
    if (!hireDate) addErr('入职日期', '入职日期不能为空');
    else if (!dateRe.test(hireDate) || Number.isNaN(new Date(hireDate).getTime())) addErr('入职日期', '日期格式应为 YYYY-MM-DD');

    const genderRaw = get('性别');
    if (!(genderRaw in genderMap)) addErr('性别', `性别值「${genderRaw}」无法识别（支持：男/女/未知）`);

    let empNo = get('工号');
    if (!empNo) empNo = `I${Date.now().toString().slice(-6)}${rowNo}`;
    if (db.prepare('SELECT id FROM employees WHERE emp_no = ?').get(empNo)) addErr('工号', `工号「${empNo}」已存在`);
    if (batchNos.has(empNo)) addErr('工号', `工号「${empNo}」在文件中重复`);
    batchNos.add(empNo);

    const phone = get('手机号');
    if (phone && !/^1\d{10}$/.test(phone)) addErr('手机号', `手机号「${phone}」格式不正确`);

    let baseSalary = 0;
    const salaryRaw = get('基本工资');
    if (salaryRaw !== '') {
      baseSalary = Number(salaryRaw);
      if (!Number.isFinite(baseSalary) || baseSalary < 0) addErr('基本工资', `工资金额「${salaryRaw}」不合法`);
    }
    const email = get('邮箱');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) addErr('邮箱', `邮箱「${email}」格式不正确`);

    if (errors.every((x) => x.row !== rowNo)) {
      parsed.push({ empNo, name, gender: genderMap[genderRaw], departmentId, positionId, phone, email, hireDate, baseSalary });
    }
  });

  if (errors.length) {
    return res.status(400).json({ code: 'IMPORT_FAILED', message: `校验未通过，共 ${errors.length} 处错误，未导入任何数据`, detail: errors });
  }

  const insert = db.prepare(`
    INSERT INTO employees (emp_no, name, gender, department_id, position_id, phone, email, hire_date, base_salary, status)
    VALUES (@empNo, @name, @gender, @departmentId, @positionId, @phone, @email, @hireDate, @baseSalary, 'probation')
  `);
  const tx = db.transaction((items) => {
    for (const it of items) insert.run(it);
  });
  tx(parsed);
  writeAudit(req, 'employee.import', 'employees', `CSV 批量导入员工 ${parsed.length} 人`);
  res.json({ message: `成功导入 ${parsed.length} 名员工`, successCount: parsed.length });
}));

// 员工详情（管理端任意员工；员工角色仅能看自己）
router.get('/:id', asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const canViewSensitive = req.auth.role === 'admin' || req.auth.role === 'hr';
  if (req.auth.role === 'employee' && req.auth.employee_id !== id) throw forbidden('只能查看本人档案');
  const row = db.prepare(`
    SELECT e.*, d.name AS department_name, p.name AS position_name
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    WHERE e.id = ?
  `).get(id);
  if (!row) throw notFound('员工不存在');
  const r = { ...row };
  if (!canViewSensitive) {
    // 员工本人可见自己的身份证号，但薪资、银行账号仅管理端可见（薪资以工资单为准）
    delete r.base_salary;
    delete r.bank_account;
  }
  res.json(r);
}));

// 新增员工
router.post('/', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) throw badRequest('姓名不能为空');
  if (!b.hireDate) throw badRequest('入职日期不能为空');
  if (b.empNo && db.prepare('SELECT id FROM employees WHERE emp_no = ?').get(b.empNo)) {
    throw conflict(`工号 ${b.empNo} 已存在`);
  }
  const empNo = b.empNo || `E${String(Date.now()).slice(-6)}`;
  const info = db.prepare(`
    INSERT INTO employees (emp_no, name, gender, birth_date, id_card, phone, email,
      emergency_contact, emergency_phone, address, department_id, position_id,
      hire_date, status, base_salary, bank_account, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    empNo, String(b.name).trim(), b.gender || 'unknown', b.birthDate || null,
    b.idCard || null, b.phone || null, b.email || null,
    b.emergencyContact || null, b.emergencyPhone || null, b.address || '',
    b.departmentId || null, b.positionId || null,
    b.hireDate, b.status || 'probation', Number(b.baseSalary) || 0,
    b.bankAccount || null, b.avatarColor || '#409EFF'
  );
  writeAudit(req, 'employee.create', info.lastInsertRowid, `新增员工：${b.name}（${empNo}）`);
  res.json({ id: info.lastInsertRowid, message: '员工创建成功' });
}));

// 编辑员工档案（管理端）
router.put('/:id', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!emp) throw notFound('员工不存在');
  const b = req.body || {};
  if (b.empNo && b.empNo !== emp.emp_no && db.prepare('SELECT id FROM employees WHERE emp_no = ? AND id != ?').get(b.empNo, id)) {
    throw conflict(`工号 ${b.empNo} 已存在`);
  }
  const oldSalary = emp.base_salary;
  db.prepare(`
    UPDATE employees SET emp_no=?, name=?, gender=?, birth_date=?, id_card=?, phone=?, email=?,
      emergency_contact=?, emergency_phone=?, address=?, department_id=?, position_id=?,
      status=?, base_salary=?, bank_account=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    b.empNo || emp.emp_no, b.name || emp.name, b.gender || emp.gender,
    b.birthDate ?? emp.birth_date, b.idCard ?? emp.id_card, b.phone ?? emp.phone, b.email ?? emp.email,
    b.emergencyContact ?? emp.emergency_contact, b.emergencyPhone ?? emp.emergency_phone, b.address ?? emp.address,
    b.departmentId ?? emp.department_id, b.positionId ?? emp.position_id,
    b.status || emp.status, Number.isFinite(+b.baseSalary) ? +b.baseSalary : emp.base_salary,
    b.bankAccount ?? emp.bank_account, id
  );
  const detail = [`编辑员工档案：${emp.name}`];
  if (Number.isFinite(+b.baseSalary) && +b.baseSalary !== oldSalary) {
    detail.push(`基本工资 ${oldSalary} → ${+b.baseSalary}（建议通过调薪审批流程留痕）`);
  }
  writeAudit(req, 'employee.update', id, detail.join('；'));
  res.json({ message: '保存成功' });
}));

// 员工自助：修改本人可编辑字段
router.put('/me/profile', authenticate, asyncHandler((req, res) => {
  const id = req.auth.employee_id;
  if (!id) throw badRequest('当前账号未关联员工档案');
  const b = req.body || {};
  if (b.phone !== undefined && b.phone && !/^1\d{10}$/.test(b.phone)) throw badRequest('手机号格式不正确');
  if (b.email !== undefined && b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw badRequest('邮箱格式不正确');
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  db.prepare(`
    UPDATE employees SET phone=?, email=?, emergency_contact=?, emergency_phone=?, address=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(
    b.phone ?? emp.phone, b.email ?? emp.email,
    b.emergencyContact ?? emp.emergency_contact, b.emergencyPhone ?? emp.emergency_phone,
    b.address ?? emp.address, id
  );
  writeAudit(req, 'employee.selfUpdate', id, '员工更新本人资料');
  res.json({ message: '资料已更新' });
}));

// 离职：状态机 regular/probation -> resigned，记录离职日期
router.post('/:id/resign', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!emp) throw notFound('员工不存在');
  if (emp.status === 'resigned') throw conflict('该员工已离职，不能重复办理离职');
  const leaveDate = (req.body && req.body.leaveDate) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) throw badRequest('离职日期格式不正确');

  db.prepare("UPDATE employees SET status='resigned', leave_date=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(leaveDate, id);
  writeAudit(req, 'employee.resign', id, `员工离职：${emp.name}，离职日期 ${leaveDate}`);
  res.json({ message: `${emp.name} 已办理离职` });
}));

// 调岗：变更部门/职位（状态不变）
router.post('/:id/transfer', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!emp) throw notFound('员工不存在');
  if (emp.status === 'resigned') throw conflict('已离职员工不能调岗');
  const { departmentId, positionId, effectiveDate } = req.body || {};
  if (!departmentId || !positionId) throw badRequest('请选择新部门与新职位');
  if (!db.prepare('SELECT id FROM departments WHERE id=?').get(departmentId)) throw badRequest('部门不存在');
  if (!db.prepare('SELECT id FROM positions WHERE id=?').get(positionId)) throw badRequest('职位不存在');

  db.prepare(`UPDATE employees SET department_id=?, position_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(departmentId, positionId, id);
  writeAudit(req, 'employee.transfer', id,
    `员工调岗：${emp.name}，部门 ${emp.department_id}→${departmentId}，职位 ${emp.position_id}→${positionId}，生效日 ${effectiveDate || '即时'}`);
  res.json({ message: '调岗成功' });
}));

module.exports = router;
