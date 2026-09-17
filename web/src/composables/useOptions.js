import { ref } from 'vue';
import { api } from '../api';

// 部门 / 职位 / 员工选项的轻量缓存，多个表单共用
const deptTree = ref([]);
const deptFlat = ref([]);
const positions = ref([]);
let loaded = false;
let loadingPromise = null;

async function loadOptions(force = false) {
  if (loaded && !force) return;
  if (loadingPromise && !force) return loadingPromise;
  loadingPromise = Promise.all([
    api.get('/api/departments', { silent: true }),
    api.get('/api/positions', { silent: true }),
  ]).then(([d, p]) => {
    deptTree.value = d.tree;
    deptFlat.value = d.list;
    positions.value = p.list;
    loaded = true;
  }).finally(() => { loadingPromise = null; });
  return loadingPromise;
}

// 带层级缩进的部门选项
function deptOptions() {
  const out = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      out.push({ id: n.id, label: `${'　'.repeat(depth)}${n.name}`, raw: n });
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(deptTree.value, 0);
  return out;
}

export function useOptions() {
  return { deptTree, deptFlat, positions, loadOptions, deptOptions };
}
