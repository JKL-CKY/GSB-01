const db = require('./db');

/**
 * 写审计日志。任何关键操作（删除、批量、权限变更、薪资修改、重置数据等）都必须调用。
 * 日志只追加：系统内没有任何更新/删除日志的接口。
 */
function writeAudit(req, action, target = '', detail = '') {
  const u = req.auth || {};
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, role, action, target, detail, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    u.id || null,
    u.username || 'anonymous',
    u.role || '',
    action,
    String(target),
    typeof detail === 'string' ? detail : JSON.stringify(detail),
    req.ip || ''
  );
}

module.exports = { writeAudit };
