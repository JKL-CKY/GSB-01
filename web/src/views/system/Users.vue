<template>
  <div class="page-container">
    <h1 class="page-title">用户与角色</h1>
    <p class="page-sub">仅系统管理员可访问；权限变更、停启用均需二次确认并写入审计日志</p>

    <div class="hrm-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="搜索用户名 / 姓名" clearable style="width:220px"
          :prefix-icon="Search" @keyup.enter="reload(1)" @clear="reload(1)" />
        <el-select v-model="query.role" placeholder="全部角色" clearable style="width:150px" @change="reload(1)">
          <el-option v-for="(v, k) in ROLE" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width:130px" @change="reload(1)">
          <el-option label="启用" value="active" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <el-button type="primary" plain :icon="Search" @click="reload(1)">查询</el-button>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
      </div>

      <div class="table-wrap">
        <el-table :data="list" border stripe v-loading="loading" style="width:100%" @sort-change="onSortChange">
          <el-table-column prop="username" label="用户名" min-width="130" sortable="custom" />
          <el-table-column prop="employee_name" label="关联员工" min-width="130">
            <template #default="{ row }">{{ row.employee_name || '—' }}</template>
          </el-table-column>
          <el-table-column label="角色" width="130" align="center">
            <template #default="{ row }">
              <el-tag :type="dictType(ROLE, row.role)" effect="dark" round>{{ dict(ROLE, row.role) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="dictType(USER_STATUS, row.status)" effect="light" round>{{ dict(USER_STATUS, row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="170" sortable="custom" />
          <el-table-column label="操作" width="260" align="right">
            <template #default="{ row }">
              <el-button size="small" text type="warning" @click="openEdit(row)">编辑角色</el-button>
              <el-button size="small" text type="primary" @click="openResetPwd(row)">重置密码</el-button>
              <el-button size="small" text :type="row.status === 'active' ? 'danger' : 'success'" @click="toggle(row)">
                {{ row.status === 'active' ? '停用' : '启用' }}
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-skeleton v-if="loading && !list.length" :rows="6" animated class="table-skeleton" />
            <el-empty v-else-if="!loadError" description="暂无用户" />
            <el-result v-else icon="error" :title="loadError">
              <template #extra><el-button type="primary" @click="reload">重试</el-button></template>
            </el-result>
          </template>
        </el-table>
      </div>
      <div class="pagination-bar">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="reload()" @size-change="reload(1)" />
      </div>
    </div>

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑用户' : '新建用户'" width="460px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="!!form.id" placeholder="3-20 位字母/数字/下划线" />
        </el-form-item>
        <el-form-item v-if="!form.id" label="初始密码" required>
          <el-input v-model="form.password" type="password" show-password placeholder="至少 8 位" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-radio-group v-model="form.role">
            <el-radio value="admin">系统管理员</el-radio>
            <el-radio value="hr">HR</el-radio>
            <el-radio value="employee">普通员工</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.role === 'employee'" label="关联员工" required>
          <el-select v-model="form.employeeId" filterable placeholder="选择员工档案" style="width:100%">
            <el-option v-for="e in employees" :key="e.id"
              :label="`${e.name}（${e.emp_no}）${e.status === 'resigned' ? '·已离职' : ''}`" :value="e.id"
              :disabled="e.status === 'resigned'" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.id" label="账号状态">
          <el-switch v-model="form.status" active-value="active" inactive-value="disabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="pwdVisible" title="重置密码" width="420px">
      <el-alert type="warning" :closable="false" show-icon :title="`将重置用户「${pwdTarget?.username}」的登录密码`" style="margin-bottom:14px" />
      <el-input v-model="newPwd" type="password" show-password placeholder="新密码（至少 8 位）" />
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { api } from '../../api';
import { ROLE, USER_STATUS, dict, dictType } from '../../utils/dict';

const loading = ref(false);
const loadError = ref('');
const list = ref([]);
const total = ref(0);
const query = reactive({ keyword: '', role: '', status: '', page: 1, pageSize: 10, sort: '', order: '' });
const employees = ref([]);

function onSortChange({ prop, order }) {
  query.sort = order ? prop : '';
  query.order = order === 'descending' ? 'desc' : 'asc';
  reload(1);
}

async function reload(page) {
  if (page) query.page = page;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/api/system/users' + api.qs(query), { silent: true });
    list.value = res.list;
    total.value = res.total;
  } catch (e) {
    loadError.value = e.message;
    list.value = [];
  } finally { loading.value = false; }
}

const formVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, username: '', password: '', role: 'employee', employeeId: null, status: 'active' });

function openCreate() {
  Object.assign(form, { id: null, username: '', password: '', role: 'employee', employeeId: null, status: 'active' });
  formVisible.value = true;
}
function openEdit(row) {
  Object.assign(form, { id: row.id, username: row.username, password: '', role: row.role, employeeId: row.employee_id, status: row.status });
  formVisible.value = true;
}
async function save() {
  if (form.role === 'employee' && !form.employeeId) return ElMessage.warning('员工账号必须关联员工档案');
  if (!form.id) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.username)) return ElMessage.warning('用户名需为 3-20 位字母、数字或下划线');
    if (!form.password || form.password.length < 8) return ElMessage.warning('初始密码至少 8 位');
    await ElMessageBox.confirm(`确认创建用户「${form.username}」并赋予「${dict(ROLE, form.role)}」角色？该操作会写入审计日志。`, '创建确认', { type: 'warning' });
    await api.post('/api/system/users', { ...form });
  } else {
    await ElMessageBox.confirm(`确认修改用户「${form.username}」的角色/状态？权限变更会写入审计日志。`, '权限变更二次确认', { type: 'warning' });
    await api.put(`/api/system/users/${form.id}`, { role: form.role, employeeId: form.employeeId, status: form.status });
  }
  ElMessage.success('保存成功');
  formVisible.value = false;
  reload();
}

/* 重置密码 */
const pwdVisible = ref(false);
const pwdTarget = ref(null);
const newPwd = ref('');
function openResetPwd(row) { pwdTarget.value = row; newPwd.value = ''; pwdVisible.value = true; }
async function submitResetPwd() {
  if (!newPwd.value || newPwd.value.length < 8) return ElMessage.warning('新密码至少 8 位');
  await ElMessageBox.confirm(`确认重置「${pwdTarget.value.username}」的密码？`, '重置密码二次确认', { type: 'warning' });
  saving.value = true;
  try {
    await api.post(`/api/system/users/${pwdTarget.value.id}/reset-password`, { password: newPwd.value });
    ElMessage.success('密码已重置');
    pwdVisible.value = false;
  } finally { saving.value = false; }
}

async function toggle(row) {
  const willDisable = row.status === 'active';
  await ElMessageBox.confirm(
    willDisable ? `确认停用用户「${row.username}」？停用后该账号将无法登录。` : `确认启用用户「${row.username}」？`,
    '账号状态变更二次确认',
    { type: 'warning', confirmButtonText: willDisable ? '确认停用' : '确认启用', confirmButtonClass: willDisable ? 'el-button--danger' : '' }
  );
  await api.post(`/api/system/users/${row.id}/toggle`, {});
  ElMessage.success('操作成功');
  reload();
}

onMounted(async () => {
  const res = await api.get('/api/employees?pageSize=200', { silent: true });
  employees.value = res.list;
  reload(1);
});
</script>

<style scoped>
.table-skeleton { padding: 12px 8px; }
</style>
