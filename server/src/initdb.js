/**
 * 数据库初始化入口
 *   node src/initdb.js          建表；若已存在演示数据则保留（需 --force 才覆盖）
 *   node src/initdb.js --force  清空并重新灌入演示数据
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const config = require('./config');
const { seedDatabase, hasData } = require('./seed');

const force = process.argv.includes('--force');

if (!force && hasData()) {
  console.log('数据库中已存在数据，跳过初始化。如需重置为演示数据请运行：npm run initdb:force');
  process.exit(0);
}

const count = seedDatabase();
console.log('✓ 数据库初始化完成：', config.dbPath);
console.log(`✓ 已灌入演示数据（员工 ${count.employees} 人）`);
console.log('');
console.log('演示账号：');
console.log('  管理员   admin     / Admin@123');
console.log('  HR       hr        / Hr@123');
console.log('  普通员工 zhangwei  / Emp@123');
db.close();
