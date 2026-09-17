/** 枚举字典 + 格式化（页面绝不直接展示英文枚举） */

export const GENDER = {
  male: { label: '男', tag: '' },
  female: { label: '女', tag: '' },
  unknown: { label: '未知', tag: 'info' },
};

export const EMP_STATUS = {
  probation: { label: '试用期', type: 'warning' },
  regular: { label: '正式', type: 'success' },
  resigned: { label: '已离职', type: 'info' },
};

export const LEAVE_TYPE = {
  sick: { label: '病假', color: '#f56c6c' },
  personal: { label: '事假', color: '#e6a23c' },
  annual: { label: '年假', color: '#409eff' },
  marriage: { label: '婚假', color: '#b37feb' },
  maternity: { label: '产假', color: '#ff85c0' },
  other: { label: '其他', color: '#909399' },
};

export const LEAVE_STATUS = {
  draft: { label: '草稿', type: 'info' },
  pending: { label: '待审批', type: 'warning' },
  approved: { label: '已通过', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' },
  cancelled: { label: '已撤销', type: 'info' },
};

export const APPROVAL_STATUS = {
  pending: { label: '待审批', type: 'warning' },
  approved: { label: '已通过', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' },
};

export const ATT_STATUS = {
  normal: { label: '正常', type: 'success' },
  late: { label: '迟到', type: 'warning' },
  early_leave: { label: '早退', type: 'warning' },
  absent: { label: '缺勤', type: 'danger' },
  leave: { label: '请假', type: 'info' },
};

export const ROLE = {
  admin: { label: '系统管理员', type: 'danger' },
  hr: { label: 'HR', type: 'primary' },
  employee: { label: '普通员工', type: 'info' },
};

export const USER_STATUS = {
  active: { label: '启用', type: 'success' },
  disabled: { label: '停用', type: 'danger' },
};

export const dict = (map, key) => (map[key] ? map[key].label : key || '-');
export const dictType = (map, key) => (map[key] ? map[key].type : 'info');

export function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '-';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(s) {
  if (!s) return '-';
  return String(s).slice(0, 10);
}

export function fmtDateTime(s) {
  if (!s) return '-';
  return String(s).replace('T', ' ').slice(0, 16);
}

export function maskIdCard(s) {
  if (!s) return '-';
  return s.replace(/^(.{4}).*(.{4})$/, '$1**********$2');
}

export function maskBank(s) {
  if (!s) return '-';
  return s.replace(/^(.{4}).*(.{4})$/, '$1 ******** $2');
}

export function maskPhone(s) {
  if (!s) return '-';
  return s.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}
