-- HRM 数据库结构
PRAGMA foreign_keys = ON;

-- 用户（登录账号）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','hr','employee')),
  employee_id INTEGER,                          -- 普通员工账号关联的员工档案
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 部门（树形）
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES departments(id),
  manager_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 职位
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 员工档案
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no TEXT NOT NULL UNIQUE,                  -- 工号
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male','female','unknown')),
  birth_date TEXT,
  id_card TEXT,                                 -- 敏感字段：仅 admin/hr 可见
  phone TEXT,
  email TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  address TEXT DEFAULT '',
  department_id INTEGER REFERENCES departments(id),
  position_id INTEGER REFERENCES positions(id),
  hire_date TEXT NOT NULL,
  leave_date TEXT,                              -- 离职日期，NULL 表示在职
  status TEXT NOT NULL DEFAULT 'regular' CHECK (status IN ('probation','regular','resigned')),
  base_salary REAL NOT NULL DEFAULT 0,          -- 敏感字段：仅 admin/hr 可见
  bank_account TEXT,                            -- 敏感字段：仅 admin/hr 可见
  avatar_color TEXT DEFAULT '#409EFF',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 考勤记录（按月每人一条汇总 + 明细？这里做每日打卡式明细，月汇总由接口聚合）
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,                      -- YYYY-MM-DD
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','late','early_leave','absent','leave')),
  UNIQUE (employee_id, work_date)
);

-- 请假单（状态机：draft 草稿 -> pending 待审批 -> approved/rejected；approved 后可 cancelled）
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('sick','personal','annual','marriage','maternity','other')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration REAL NOT NULL,                       -- 天数（0.5 为半天）
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','cancelled')),
  approver_id INTEGER REFERENCES users(id),
  approve_remark TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 转正申请（状态机：pending -> approved/rejected）
CREATE TABLE IF NOT EXISTS regular_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  expected_date TEXT NOT NULL,
  remark TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approver_id INTEGER REFERENCES users(id),
  approve_remark TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 调薪记录（状态机：pending -> approved/rejected，通过后写入员工 base_salary 并生成薪资快照）
CREATE TABLE IF NOT EXISTS salary_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  old_salary REAL NOT NULL,
  new_salary REAL NOT NULL,
  effective_month TEXT NOT NULL,                -- YYYY-MM
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approver_id INTEGER REFERENCES users(id),
  approve_remark TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 月度工资单
CREATE TABLE IF NOT EXISTS payrolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month TEXT NOT NULL,                          -- YYYY-MM
  base_salary REAL NOT NULL DEFAULT 0,
  performance REAL NOT NULL DEFAULT 0,          -- 绩效
  subsidy REAL NOT NULL DEFAULT 0,              -- 补贴
  social_insurance REAL NOT NULL DEFAULT 0,    -- 社保个人部分（扣除）
  housing_fund REAL NOT NULL DEFAULT 0,        -- 公积金个人部分（扣除）
  tax REAL NOT NULL DEFAULT 0,                 -- 个税（扣除）
  net_salary REAL NOT NULL DEFAULT 0,          -- 实发工资
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed')),
  remark TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (employee_id, month)
);

-- 审计日志（只追加，不提供修改/删除接口）
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  role TEXT,
  action TEXT NOT NULL,                         -- 如 employee.resign / payroll.batchGenerate
  target TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_payroll_month ON payrolls(month);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
