/** 列表通用解析：分页 + 白名单排序（杜绝排序字段注入） */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 10));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function parseSort(query, allowed, defaultSort = 'id DESC') {
  const key = query.sort;
  if (key && Object.prototype.hasOwnProperty.call(allowed, key)) {
    const dir = String(query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    return `${allowed[key]} ${dir}`;
  }
  return defaultSort;
}

module.exports = { parsePagination, parseSort };
