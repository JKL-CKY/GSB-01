const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { errorHandler, notFound } = require('./errors');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const departmentRoutes = require('./routes/departments');
const positionRoutes = require('./routes/positions');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const payrollRoutes = require('./routes/payrolls');
const approvalRoutes = require('./routes/approvals');
const systemRoutes = require('./routes/system');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));

// 简单访问日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/health') {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// 健康检查（前端用来探测后端是否在线）
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/payrolls', payrollRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/system', systemRoutes);

app.use('/api', (req, res, next) => next(notFound('接口不存在')));

// 统一错误处理：所有错误都以 { code, message, detail } 返回
app.use(errorHandler);

// 首次启动自动建表 + 灌入演示数据（已有数据则不动，保证重启不丢数据）
function ensureDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  const count = db.prepare("SELECT COUNT(*) c FROM employees").get().c;
  if (count === 0) {
    const { seedDatabase } = require('./seed');
    const r = seedDatabase();
    console.log(`✓ 首次启动，已自动初始化演示数据（员工 ${r.employees} 人）`);
  }
}

ensureDatabase();

app.listen(config.port, () => {
  console.log('');
  console.log('  HRM 后端服务已启动');
  console.log(`  - API 地址：http://localhost:${config.port}/api`);
  console.log(`  - 数据库：${config.dbPath}`);
  console.log('  - 演示账号：admin / Admin@123    hr / Hr@123    zhangwei / Emp@123');
  console.log('');
});
