<template>
  <div class="page-container">
    <h1 class="page-title">组织架构</h1>
    <p class="page-sub">维护部门层级与职位体系；删除前系统会校验下级部门与在职员工</p>

    <el-tabs v-model="tab" class="org-tabs">
      <!-- ============ 部门管理 ============ -->
      <el-tab-pane label="部门管理" name="dept">
        <div class="hrm-card">
          <div class="toolbar">
            <el-button type="primary" :icon="Plus" @click="openDept(null)">新增顶级部门</el-button>
            <div class="spacer"></div>
            <el-button text :loading="loading" @click="load">刷新</el-button>
          </div>

          <el-table
            :data="deptTree"
            row-key="id"
            border
            default-expand-all
            :tree-props="{ children: 'children' }"
            v-loading="loading"
            empty-text="暂无部门，请新增"
          >
            <el-table-column label="部门名称" prop="name" min-width="220" />
            <el-table-column label="负责人" width="140">
              <template #default="{ row }">{{ managerName(row.manager_id) || '—' }}</template>
            </el-table-column>
            <el-table-column label="在职人数" width="110" align="center">
              <template #default="{ row }">
                <el-tag type="primary" effect="light" round>{{ totalCount(row.id) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="排序" prop="sort_order" width="80" align="center" />
            <el-table-column label="操作" width="240" align="right">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="openDept(row)">添加子部门</el-button>
                <el-button size="small" text type="warning" @click="openDept(row, true)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removeDept(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- ============ 职位管理 ============ -->
      <el-tab-pane label="职位管理" name="position">
        <div class="hrm-card">
          <div class="toolbar">
            <el-button type="primary" :icon="Plus" @click="openPosition(null)">新增职位</el-button>
          </div>
          <el-table :data="positions" border v-loading="loading" empty-text="暂无职位">
            <el-table-column label="职位名称" prop="name" min-width="180" />
            <el-table-column label="描述" prop="description" min-width="260" show-overflow-tooltip />
            <el-table-column label="创建时间" width="180">
              <template #default="{ row }">{{ fmtDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="170" align="right">
              <template #default="{ row }">
                <el-button size="small" text type="warning" @click="openPosition(row)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removePosition(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 部门编辑弹窗 -->
    <el-dialog v-model="deptDlg" :title="deptForm.id ? '编辑部门' : '新增部门'" width="460px">
      <el-form :model="deptForm" label-width="92px">
        <el-form-item label="部门名称" required>
          <el-input v-model="deptForm.name" maxlength="30" show-word-limit placeholder="请输入部门名称" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-tree-select v-model="deptForm.parentId" :data="deptTreeData" :render-after-expand="false"
            check-strictly node-key="id" :props="{ label: 'name', children: 'children' }"
            placeholder="不选则为顶级部门" clearable style="width:100%" />
        </el-form-item>
        <el-form-item label="部门负责人">
          <el-select v-model="deptForm.managerId" placeholder="可选" clearable filterable style="width:100%">
            <el-option v-for="e in managerCandidates" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="deptForm.sortOrder" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDept">保存</el-button>
      </template>
    </el-dialog>

    <!-- 职位编辑弹窗 -->
    <el-dialog v-model="posDlg" :title="posForm.id ? '编辑职位' : '新增职位'" width="440px">
      <el-form :model="posForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="posForm.name" placeholder="如：前端工程师" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="posForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="posDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePosition">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../../api';
import { useOptions } from '../../composables/useOptions';
import { fmtDateTime } from '../../utils/dict';

const tab = ref('dept');
const loading = ref(false);
const saving = ref(false);
const { deptTree, deptFlat, positions, loadOptions } = useOptions();

const managerCandidates = ref([]);

async function load() {
  loading.value = true;
  try {
    await loadOptions(true);
    const empRes = await api.get('/api/employees?pageSize=200&status=regular', { silent: true });
    managerCandidates.value = empRes.list;
  } finally {
    loading.value = false;
  }
}

function managerName(id) {
  return managerCandidates.value.find((e) => e.id === id)?.name || '';
}

// 含子部门的总在职人数
function totalCount(deptId) {
  const ids = [deptId];
  let added = true;
  while (added) {
    added = false;
    for (const d of deptFlat.value) {
      if (d.parent_id && ids.includes(d.parent_id) && !ids.includes(d.id)) { ids.push(d.id); added = true; }
    }
  }
  return deptFlat.value.filter((d) => ids.includes(d.id)).reduce((s, d) => s + (d.active_count || 0), 0);
}

/* ---------- 部门弹窗 ---------- */
const deptDlg = ref(false);
const deptForm = reactive({ id: null, name: '', parentId: null, managerId: null, sortOrder: 0 });

const deptTreeData = computed(() => deptTree.value);

function openDept(row, edit = false) {
  if (edit) {
    Object.assign(deptForm, { id: row.id, name: row.name, parentId: row.parent_id, managerId: row.manager_id, sortOrder: row.sort_order });
  } else if (row) {
    Object.assign(deptForm, { id: null, name: '', parentId: row.id, managerId: null, sortOrder: 0 });
  } else {
    Object.assign(deptForm, { id: null, name: '', parentId: null, managerId: null, sortOrder: 0 });
  }
  deptDlg.value = true;
}

async function saveDept() {
  if (!deptForm.name.trim()) return ElMessage.warning('请填写部门名称');
  saving.value = true;
  try {
    const payload = { name: deptForm.name.trim(), parentId: deptForm.parentId, managerId: deptForm.managerId, sortOrder: deptForm.sortOrder };
    if (deptForm.id) await api.put(`/api/departments/${deptForm.id}`, payload);
    else await api.post('/api/departments', payload);
    ElMessage.success('保存成功');
    deptDlg.value = false;
    await load();
  } finally { saving.value = false; }
}

async function removeDept(row) {
  // 关键删除操作：二次确认，后端再做硬校验并返回明确原因
  await ElMessageBox.confirm(
    `确定删除部门「${row.name}」吗？若存在子部门或在职员工，系统将拒绝删除。`,
    '删除部门二次确认',
    { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
  );
  await api.del(`/api/departments/${row.id}`);
  ElMessage.success('部门已删除');
  await load();
}

/* ---------- 职位弹窗 ---------- */
const posDlg = ref(false);
const posForm = reactive({ id: null, name: '', description: '' });

function openPosition(row) {
  if (row) Object.assign(posForm, { id: row.id, name: row.name, description: row.description });
  else Object.assign(posForm, { id: null, name: '', description: '' });
  posDlg.value = true;
}

async function savePosition() {
  if (!posForm.name.trim()) return ElMessage.warning('请填写职位名称');
  saving.value = true;
  try {
    const payload = { name: posForm.name.trim(), description: posForm.description.trim() };
    if (posForm.id) await api.put(`/api/positions/${posForm.id}`, payload);
    else await api.post('/api/positions', payload);
    ElMessage.success('保存成功');
    posDlg.value = false;
    await load();
  } finally { saving.value = false; }
}

async function removePosition(row) {
  await ElMessageBox.confirm(
    `确定删除职位「${row.name}」吗？若仍有在职员工担任该职位，系统将拒绝删除。`,
    '删除职位二次确认',
    { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
  );
  await api.del(`/api/positions/${row.id}`);
  ElMessage.success('职位已删除');
  await load();
}

onMounted(load);
</script>

<style scoped>
.org-tabs :deep(.el-tabs__header) { margin-bottom: 14px; }
</style>
