const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');
const { writeAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  res.json({ list: db.prepare('SELECT * FROM positions ORDER BY id').all() });
});

router.post('/', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) throw badRequest('职位名称不能为空');
  const exists = db.prepare('SELECT id FROM positions WHERE name = ?').get(name);
  if (exists) throw conflict('该职位已存在');
  const info = db.prepare('INSERT INTO positions (name, description) VALUES (?, ?)')
    .run(name, (req.body.description || '').trim());
  writeAudit(req, 'position.create', info.lastInsertRowid, `新增职位：${name}`);
  res.json({ id: info.lastInsertRowid });
}));

router.put('/:id', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const pos = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  if (!pos) throw notFound('职位不存在');
  const name = (req.body.name || pos.name).trim();
  const dup = db.prepare('SELECT id FROM positions WHERE name = ? AND id != ?').get(name, id);
  if (dup) throw conflict('该职位名称已存在');
  db.prepare('UPDATE positions SET name=?, description=? WHERE id=?')
    .run(name, (req.body.description || '').trim(), id);
  writeAudit(req, 'position.update', id, `编辑职位：${name}`);
  res.json({ message: '保存成功' });
}));

// 删除职位：有在职员工使用则禁止
router.delete('/:id', requireRole('admin', 'hr'), asyncHandler((req, res) => {
  const id = parseInt(req.params.id, 10);
  const pos = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  if (!pos) throw notFound('职位不存在');
  const empCount = db.prepare(
    "SELECT COUNT(*) c FROM employees WHERE position_id = ? AND status != 'resigned'"
  ).get(id).c;
  if (empCount > 0) throw conflict(`还有 ${empCount} 名在职员工担任该职位，请先调整其职位后再删除`);
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  writeAudit(req, 'position.delete', id, `删除职位：${pos.name}`);
  res.json({ message: '删除成功' });
}));

module.exports = router;
