const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'hrm-local-dev-secret-please-change',
  jwtExpiresIn: '12h',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hrm.db'),
};
