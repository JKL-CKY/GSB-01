const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

// 部门树（所有登录用户可读，员工档案页也要展示部门）
router.get('/', (req, res) => {
  const depts = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM employees e
                 WHERE e.department_id = d.id AND e.status != 'resigned') AS active_count
    FROM departments d ORDER BY d.sort_order, d.id
  `).all();
  const map = new Map(depts.map((d) => [d.id, { ...d, children: [] }]));
  const tree = [];
  for (const d of map.values()) {
    if (d.parent_id && map.has(d.parent_id)) map.get(d.parent_id).children.push(d);
    else tree.push(d);
  }
  res.json({ list: depts, tree });
});

// 新增部门
router.post('/', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const { name, parentId, managerId, sortOrder } = req.body || {};
  if (!name || !String(name).trim()) throw badRequest('部门名称不能为空');
  if (parentId) {
    const parent = db.prepare('SELECT id FROM departments WHERE id = ?').get(parentId);
    if (!parent) throw badRequest('上级部门不存在');
  }
  const info = db.prepare(
    'INSERT INTO departments (name, parent_id, manager_id, sort_order) VALUES (?, ?, ?, ?)'
  ).run(String(name).trim(), parentId || null, managerId || null, sortOrder || 0);
  writeAudit(req, 'department.create', info.lastInsertRowid, `新增部门：${name}`);
  res.json({ id: info.lastInsertRowid });
}));

// 编辑部门
router.put('/:id', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!dept) throw notFound('部门不存在');
  const { name, parentId, managerId, sortOrder } = req.body || {};
  if (parentId === id) throw badRequest('上级部门不能选择自己');
  if (parentId) {
    // 不能挂到自己的子部门下（防止环）
    let cursor = parentId;
    while (cursor) {
      if (cursor === id) throw badRequest('不能把部门移动到自己的子部门下');
      const row = db.prepare('SELECT parent_id FROM departments WHERE id = ?').get(cursor);
      cursor = row && row.parent_id;
    }
  }
  db.prepare('UPDATE departments SET name=?, parent_id=?, manager_id=?, sort_order=? WHERE id=?')
    .run(name ? String(name).trim() : dept.name, parentId || null, managerId || null, sortOrder ?? dept.sort_order, id);
  writeAudit(req, 'department.update', id, `编辑部门：${name || dept.name}`);
  res.json({ message: '保存成功' });
}));

// 删除部门：有子部门或在职（含试用）员工则禁止
router.delete('/:id', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!dept) throw notFound('部门不存在');

  const childCount = db.prepare('SELECT COUNT(*) c FROM departments WHERE parent_id = ?').get(id).c;
  if (childCount > 0) throw conflict(`该部门下还有 ${childCount} 个子部门，请先调整或删除子部门`);

  const empCount = db.prepare(
    "SELECT COUNT(*) c FROM employees WHERE department_id = ? AND status != 'resigned'"
  ).get(id).c;
  if (empCount > 0) throw conflict(`该部门下还有 ${empCount} 名在职员工，请先调岗或离职后再删除`);

  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  writeAudit(req, 'department.delete', id, `删除部门：${dept.name}`);
  res.json({ message: '删除成功' });
}));

module.exports = router;
