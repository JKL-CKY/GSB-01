/**
 * 演示数据初始化 / 一键重置
 * - npm run initdb        仅建表（空库时灌入演示数据）
 * - npm run initdb:force  清空并重新灌入演示数据
 * 系统管理里的「一键重置演示数据」同样调用 seedDatabase()
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// ---------- 日期工具（本地时间，避免 UTC 偏移） ----------
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function isWeekend(d) {
  const w = d.getDay();
  return w === 0 || w === 6;
}
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// 可复现的伪随机（保证每次重置后数据一致）
function makeRng(seed = 20260917) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 简易个税计算（累计预扣的月度简化版，仅用于演示数据）
function calcTax(taxable) {
  if (taxable <= 0) return 0;
  const brackets = [
    [3000, 0.03, 0],
    [12000, 0.1, 210],
    [25000, 0.2, 1410],
    [35000, 0.25, 2660],
    [55000, 0.3, 4410],
    [80000, 0.35, 7160],
    [Infinity, 0.45, 15160],
  ];
  for (const [cap, rate, quick] of brackets) {
    if (taxable <= cap) return round2(taxable * rate - quick);
  }
  return 0;
}

const DEPARTMENTS = [
  { id: 1, name: '总经办', parent_id: null, manager_id: null, sort_order: 1 },
  { id: 2, name: '人力资源部', parent_id: null, manager_id: null, sort_order: 2 },
  { id: 3, name: '财务部', parent_id: null, manager_id: null, sort_order: 3 },
  { id: 4, name: '技术中心', parent_id: null, manager_id: null, sort_order: 4 },
  { id: 5, name: '前端组', parent_id: 4, manager_id: null, sort_order: 1 },
  { id: 6, name: '后端组', parent_id: 4, manager_id: null, sort_order: 2 },
  { id: 7, name: '测试组', parent_id: 4, manager_id: null, sort_order: 3 },
  { id: 8, name: '市场部', parent_id: null, manager_id: null, sort_order: 5 },
];

const POSITIONS = [
  { id: 1, name: '总经理', description: '公司整体经营管理' },
  { id: 2, name: 'HR经理', description: '人力资源统筹' },
  { id: 3, name: 'HR专员', description: '招聘与员工关系' },
  { id: 4, name: '财务主管', description: '财务核算与资金管理' },
  { id: 5, name: '会计', description: '账务处理与报税' },
  { id: 6, name: '技术总监', description: '技术规划与团队管理' },
  { id: 7, name: '前端工程师', description: 'Web 前端研发' },
  { id: 8, name: '后端工程师', description: '服务端研发' },
  { id: 9, name: '测试工程师', description: '质量保障' },
  { id: 10, name: '市场经理', description: '品牌与市场推广' },
  { id: 11, name: '市场专员', description: '渠道与活动执行' },
];

const COLORS = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#8E44AD', '#16A085', '#D35400'];

function emp(id, name, gender, dept, pos, hireOffsetMonths, base, status, extra = {}) {
  const today = new Date();
  const hire = fmt(addMonths(today, hireOffsetMonths));
  return {
    id, emp_no: `E${String(id).padStart(3, '0')}`, name, gender,
    birth_date: `${1985 + (id % 15)}-0${(id % 9) + 1}-1${id % 9}`,
    id_card: `3101${String(10000000 + id * 137).slice(0, 8)}${(id % 9)}12X`.slice(0, 18),
    phone: `138${String(10000000 + id * 24680).slice(0, 8)}`,
    email: `user${id}@example.com`,
    emergency_contact: `${name[0]}家属`,
    emergency_phone: `139${String(20000000 + id * 13579).slice(0, 8)}`,
    address: '上海市浦东新区演示路 88 号',
    department_id: dept, position_id: pos,
    hire_date: hire,
    leave_date: null,
    status, base_salary: base,
    bank_account: `6222${String(100000000000 + id * 7777).slice(0, 12)}`,
    avatar_color: COLORS[id % COLORS.length],
    ...extra,
  };
}

function buildEmployees() {
  return [
    emp(1, '张伟', 'male', 6, 8, -14, 18000, 'regular'),
    emp(2, '李娜', 'female', 2, 2, -30, 16000, 'regular'),
    emp(3, '王芳', 'female', 3, 4, -26, 15000, 'regular'),
    emp(4, '刘强', 'male', 1, 1, -36, 42000, 'regular'),
    emp(5, '陈静', 'female', 5, 7, -2, 14000, 'probation'),
    emp(6, '杨洋', 'male', 6, 8, -10, 16000, 'regular'),
    emp(7, '赵磊', 'male', 7, 9, -8, 12000, 'regular'),
    emp(8, '黄敏', 'female', 8, 10, -18, 15000, 'regular'),
    emp(9, '周杰', 'male', 6, 8, -20, 21000, 'regular'),
    emp(10, '吴婷', 'female', 2, 3, -6, 9000, 'regular'),
    emp(11, '徐刚', 'male', 8, 11, -1, 8500, 'probation'),
    emp(12, '孙丽', 'female', 3, 5, -12, 9500, 'regular'),
    emp(13, '马超', 'male', 5, 7, -9, 15000, 'regular'),
    emp(14, '朱琳', 'female', 7, 9, -11, 11000, 'resigned', { leave_date: fmt(addMonths(new Date(), -4)) }),
    emp(15, '钱进', 'male', 8, 11, -16, 8800, 'resigned', { leave_date: fmt(addMonths(new Date(), -6)) }),
    emp(16, '白雪', 'female', 5, 7, -22, 13000, 'resigned', { leave_date: fmt(addMonths(new Date(), -9)) }),
  ];
}

function seedDatabase() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  // 清空（外键约束在事务外关闭）
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    const tables = [
      'audit_logs', 'payrolls', 'salary_adjustments', 'regular_requests',
      'leave_requests', 'attendance', 'employees', 'positions',
      'departments', 'users',
    ];
    for (const t of tables) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM sqlite_sequence");

    const rng = makeRng();
    const today = new Date();

    // ---- 部门 ----
    const insDept = db.prepare(
      'INSERT INTO departments (id, name, parent_id, manager_id, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    DEPARTMENTS.forEach((d) => insDept.run(d.id, d.name, d.parent_id, d.manager_id, d.sort_order));

    // ---- 职位 ----
    const insPos = db.prepare(
      'INSERT INTO positions (id, name, description) VALUES (?, ?, ?)'
    );
    POSITIONS.forEach((p) => insPos.run(p.id, p.name, p.description));

    // ---- 员工 ----
    const employees = buildEmployees();
    const insEmp = db.prepare(`
      INSERT INTO employees (
        id, emp_no, name, gender, birth_date, id_card, phone, email,
        emergency_contact, emergency_phone, address,
        department_id, position_id, hire_date, leave_date, status,
        base_salary, bank_account, avatar_color
      ) VALUES (@id, @emp_no, @name, @gender, @birth_date, @id_card, @phone, @email,
        @emergency_contact, @emergency_phone, @address,
        @department_id, @position_id, @hire_date, @leave_date, @status,
        @base_salary, @bank_account, @avatar_color)
    `);
    employees.forEach((e) => insEmp.run(e));

    // 部门负责人
    db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(4, 9);
    db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(6, 1);
    db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(2, 2);

    // ---- 登录账号（密码加盐 bcrypt 哈希）----
    const hash = bcrypt.hashSync('Admin@123', 10);
    const insUser = db.prepare(
      'INSERT INTO users (username, password_hash, role, employee_id, status) VALUES (?, ?, ?, ?, ?)'
    );
    insUser.run('admin', hash, 'admin', 4, 'active');
    insUser.run('hr', bcrypt.hashSync('Hr@123', 10), 'hr', 2, 'active');
    insUser.run('zhangwei', bcrypt.hashSync('Emp@123', 10), 'employee', 1, 'active');

    // ---- 考勤明细：最近 3 个完整月 + 本月至今（仅工作日，仅在职员工）----
    const insAtt = db.prepare(
      'INSERT INTO attendance (employee_id, work_date, check_in, check_out, status) VALUES (?, ?, ?, ?, ?)'
    );
    const activeEmps = employees.filter((e) => e.status !== 'resigned');
    for (let mOff = -3; mOff <= 0; mOff++) {
      const cursor = new Date(today.getFullYear(), today.getMonth() + mOff, 1);
      const lastDay = mOff === 0 ? today.getDate() : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
        if (isWeekend(d)) continue;
        const ds = fmt(d);
        for (const e of activeEmps) {
          const r = rng();
          let status = 'normal';
          let checkIn = '09:0' + (day % 6);
          let checkOut = '18:3' + (day % 5);
          if (r < 0.06) { status = 'late'; checkIn = `09:${20 + (day % 30)}`; }
          else if (r < 0.09) { status = 'early_leave'; checkOut = `17:${10 + (day % 40)}`; }
          else if (r < 0.11) { status = 'absent'; checkIn = null; checkOut = null; }
          insAtt.run(e.id, ds, checkIn, checkOut, status);
        }
      }
    }

    // ---- 请假单（覆盖各状态）----
    const insLeave = db.prepare(`
      INSERT INTO leave_requests
        (employee_id, leave_type, start_time, end_time, duration, reason, status, approver_id, approve_remark, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime','-2 day'))
    `);
    insLeave.run(1, 'annual', fmt(addMonths(today, 0)) + ' 09:00', fmt(addMonths(today, 0)) + ' 18:00', 1, '家中有事，需回家处理', 'pending', null, '');
    insLeave.run(7, 'personal', fmt(addMonths(today, 0)).slice(0, 8) + '05 09:00', fmt(addMonths(today, 0)).slice(0, 8) + '06 18:00', 2, '办理个人证件', 'pending', null, '');
    insLeave.run(5, 'sick', fmt(addMonths(today, -1)).slice(0, 8) + '12 09:00', fmt(addMonths(today, -1)).slice(0, 8) + '12 18:00', 1, '感冒发烧就医', 'approved', 2, '注意休息');
    insLeave.run(10, 'personal', fmt(addMonths(today, -1)).slice(0, 8) + '20 09:00', fmt(addMonths(today, -1)).slice(0, 8) + '20 18:00', 1, '私事调休', 'rejected', 2, '当日有招聘活动，请改期');
    insLeave.run(11, 'annual', fmt(addMonths(today, 1)).slice(0, 8) + '10 09:00', fmt(addMonths(today, 1)).slice(0, 8) + '11 18:00', 2, '计划出游（草稿）', 'draft', null, '');

    // ---- 转正申请 ----
    const insReg = db.prepare(`
      INSERT INTO regular_requests (employee_id, expected_date, remark, status, created_at)
      VALUES (?, ?, ?, 'pending', datetime('now','localtime','-1 day'))
    `);
    insReg.run(5, fmt(addMonths(new Date(today.getFullYear(), today.getMonth() + 4, 1), 0)), '试用期表现良好，申请按期转正');

    // ---- 调薪申请 ----
    const insAdj = db.prepare(`
      INSERT INTO salary_adjustments (employee_id, old_salary, new_salary, effective_month, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now','localtime','-3 day'))
    `);
    insAdj.run(13, 15000, 16500, monthKey(addMonths(today, 1)), '年度绩效优秀，技术骨干调薪');

    // ---- 月度工资单（最近两个完整月，在职员工）----
    const insPay = db.prepare(`
      INSERT INTO payrolls (employee_id, month, base_salary, performance, subsidy,
        social_insurance, housing_fund, tax, net_salary, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `);
    for (const mOff of [-2, -1]) {
      const mk = monthKey(addMonths(today, mOff));
      for (const e of activeEmps) {
        const base = e.base_salary;
        const performance = round2(base * (0.12 + (e.id % 5) * 0.02));
        const subsidy = 500;
        const social = round2(base * 0.105);
        const fund = round2(base * 0.07);
        const taxable = base + performance + subsidy - social - fund - 5000;
        const tax = calcTax(taxable);
        const net = round2(base + performance + subsidy - social - fund - tax);
        insPay.run(e.id, mk, base, performance, subsidy, social, fund, tax, net);
      }
    }

    // ---- 初始审计日志 ----
    const insAudit = db.prepare(
      "INSERT INTO audit_logs (user_id, username, role, action, target, detail, ip) VALUES (1, 'admin', 'admin', 'system.init', '全部', '初始化演示数据', '127.0.0.1')"
    );
    insAudit.run();
  });

  tx();
  db.pragma('foreign_keys = ON');
  return { employees: employees_count_hint() };

  function employees_count_hint() {
    return db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
  }
}

function hasData() {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'").get();
  if (!row) return false;
  return db.prepare('SELECT COUNT(*) AS c FROM employees').get().c > 0;
}

module.exports = { seedDatabase, hasData };
