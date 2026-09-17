<template>
  <div class="page-container">
    <h1 class="page-title">员工管理</h1>
    <p class="page-sub">维护员工全生命周期档案；薪资、身份证等敏感字段仅管理员与 HR 可见</p>

    <div class="hrm-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="搜索姓名 / 工号 / 手机号" clearable style="width:230px"
          :prefix-icon="Search" @keyup.enter="reload(1)" @clear="reload(1)" />
        <el-tree-select v-model="query.departmentId" :data="deptTree" :render-after-expand="false"
          node-key="id" :props="{ label: 'name', children: 'children' }" check-strictly clearable
          placeholder="全部部门" style="width:180px" @change="reload(1)" />
        <el-select v-model="query.positionId" placeholder="全部职位" clearable filterable style="width:160px" @change="reload(1)">
          <el-option v-for="p in positions" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width:130px" @change="reload(1)">
          <el-option label="试用期" value="probation" />
          <el-option label="正式" value="regular" />
          <el-option label="已离职" value="resigned" />
        </el-select>
        <el-button type="primary" plain :icon="Search" @click="reload(1)">查询</el-button>
        <el-button :icon="RefreshLeft" @click="resetQuery">重置</el-button>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增员工</el-button>
        <el-button :icon="Upload" @click="importVisible = true">批量导入</el-button>
        <el-button :icon="Download" @click="exportCsv">导出 CSV</el-button>
      </div>

      <div class="table-wrap">
        <el-table :data="list" border stripe v-loading="loading" element-loading-text="加载中…"
          @sort-change="onSortChange" @row-click="openDetail" :row-class-name="rowClass" style="width:100%">
          <el-table-column prop="emp_no" label="工号" width="90" sortable="custom" />
          <el-table-column label="员工" min-width="170">
            <template #default="{ row }">
              <div class="emp-cell">
                <el-avatar :size="34" :style="{ background: row.avatar_color || '#4361ee' }">{{ row.name.slice(0, 1) }}</el-avatar>
                <div>
                  <div class="emp-name">{{ row.name }}</div>
                  <div class="emp-sub">{{ dict(GENDER, row.gender) }} · {{ maskPhone(row.phone) }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="department_name" label="部门" min-width="120" />
          <el-table-column prop="position_name" label="职位" min-width="120" />
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="dictType(EMP_STATUS, row.status)" effect="light" round>{{ dict(EMP_STATUS, row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="hire_date" label="入职日期" width="115" sortable="custom" />
          <el-table-column v-if="canSensitive" label="基本工资" width="120" align="right" sortable="custom">
            <template #default="{ row }">
              <span v-if="row.status !== 'resigned'" class="money">{{ fmtMoney(row.base_salary) }}</span>
              <span v-else class="emp-sub">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="230" align="right" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click.stop="openDetail(row)">详情</el-button>
              <el-button size="small" text type="warning" @click.stop="openEdit(row)" :disabled="row.status==='resigned'">编辑</el-button>
              <el-dropdown trigger="click" @command="(c) => onMore(c, row)" @click.stop>
                <el-button size="small" text type="info">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="transfer" :disabled="row.status==='resigned'">调岗</el-dropdown-item>
                    <el-dropdown-item command="resign" :disabled="row.status==='resigned'">办理离职</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
          <template #empty>
            <el-skeleton v-if="loading && !list.length" :rows="7" animated class="table-skeleton" />
            <el-empty v-else-if="!loadError" description="没有符合条件的员工">
              <el-button type="primary" text @click="resetQuery">清空筛选条件</el-button>
            </el-empty>
            <div v-else class="state-box">
              <el-result icon="error" :title="loadError" sub-title="请检查后端服务是否正常后重试">
                <template #extra><el-button type="primary" @click="reload">重新加载</el-button></template>
              </el-result>
            </div>
          </template>
        </el-table>
      </div>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="reload()" @size-change="reload(1)"
        />
      </div>
    </div>

    <!-- 新增/编辑 -->
    <EmployeeForm v-model="formVisible" :employee-id="editId" @saved="reload()" />
    <ImportDialog v-model="importVisible" @imported="reload(1)" />

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" size="460px" :title="detail?.name ? `${detail.name} 的档案` : '员工档案'">
      <template v-if="detail">
        <div class="detail-head">
          <el-avatar :size="64" :style="{ background: detail.avatar_color || '#4361ee', fontSize: 26 }">
            {{ detail.name?.slice(0, 1) }}
          </el-avatar>
          <div>
            <div class="detail-name">{{ detail.name }}
              <el-tag :type="dictType(EMP_STATUS, detail.status)" effect="light" round size="small">{{ dict(EMP_STATUS, detail.status) }}</el-tag>
            </div>
            <div class="emp-sub">{{ detail.emp_no }} · {{ detail.department_name }} · {{ detail.position_name }}</div>
          </div>
        </div>

        <el-descriptions :column="1" border class="detail-desc">
          <el-descriptions-item label="性别">{{ dict(GENDER, detail.gender) }}</el-descriptions-item>
          <el-descriptions-item label="出生日期">{{ fmtDate(detail.birth_date) }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ detail.email || '—' }}</el-descriptions-item>
          <el-descriptions-item label="身份证号">
            {{ canSensitive ? (detail.id_card || '—') : maskIdCard(detail.id_card) }}
          </el-descriptions-item>
          <el-descriptions-item label="银行账号">
            {{ canSensitive ? (detail.bank_account || '—') : maskBank(detail.bank_account) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="canSensitive" label="基本工资"><span class="money">{{ fmtMoney(detail.base_salary) }}</span></el-descriptions-item>
          <el-descriptions-item label="紧急联系人">{{ detail.emergency_contact || '—' }} {{ detail.emergency_phone || '' }}</el-descriptions-item>
          <el-descriptions-item label="住址">{{ detail.address || '—' }}</el-descriptions-item>
          <el-descriptions-item label="入职日期">{{ detail.hire_date }}</el-descriptions-item>
          <el-descriptions-item label="离职日期">{{ detail.leave_date ? detail.leave_date : '在职中' }}</el-descriptions-item>
        </el-descriptions>

        <div class="detail-actions">
          <el-button type="warning" :icon="Edit" @click="openEdit(detail)" :disabled="detail.status==='resigned'">编辑档案</el-button>
          <el-button type="primary" plain :icon="Sort" @click="openTransfer(detail)" :disabled="detail.status==='resigned'">调岗</el-button>
          <el-button type="danger" plain :icon="CircleClose" @click="openResign(detail)" :disabled="detail.status==='resigned'">办理离职</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 调岗弹窗 -->
    <el-dialog v-model="transferVisible" title="员工调岗" width="440px">
      <el-form label-width="84px" v-if="transferTarget">
        <el-form-item label="员工">{{ transferTarget.name }}（{{ transferTarget.department_name }} / {{ transferTarget.position_name }}）</el-form-item>
        <el-form-item label="新部门" required>
          <el-tree-select v-model="transferForm.departmentId" :data="deptTree" node-key="id"
            :props="{ label: 'name', children: 'children' }" check-strictly style="width:100%" />
        </el-form-item>
        <el-form-item label="新职位" required>
          <el-select v-model="transferForm.positionId" filterable style="width:100%">
            <el-option v-for="p in positions" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生效日期">
          <el-date-picker v-model="transferForm.effectiveDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitTransfer">确认调岗</el-button>
      </template>
    </el-dialog>

    <!-- 离职弹窗 -->
    <el-dialog v-model="resignVisible" title="办理离职" width="420px">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom:14px"
        :title="`离职后「${resignTarget?.name}」状态将变更为已离职，账号数据保留但不再计入在职名册`" />
      <el-form label-width="84px">
        <el-form-item label="离职日期" required>
          <el-date-picker v-model="resignDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resignVisible = false">取消</el-button>
        <el-button type="danger" :loading="acting" @click="submitResign">确认离职</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Search, Plus, Upload, Download, RefreshLeft, ArrowDown, Edit, Sort, CircleClose,
} from '@element-plus/icons-vue';
import { api, authStore } from '../../api';
import { useOptions } from '../../composables/useOptions';
import {
  GENDER, EMP_STATUS, dict, dictType, fmtMoney, fmtDate, maskPhone, maskIdCard, maskBank,
} from '../../utils/dict';
import EmployeeForm from './EmployeeForm.vue';
import ImportDialog from './ImportDialog.vue';

const { deptTree, positions, loadOptions } = useOptions();

const loading = ref(false);
const loadError = ref('');
const list = ref([]);
const total = ref(0);
const query = reactive({ keyword: '', departmentId: null, positionId: null, status: '', page: 1, pageSize: 10, sort: '', order: '' });
const canSensitive = authStore.isManager;

async function reload(page) {
  if (page) query.page = page;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/api/employees' + api.qs({
      keyword: query.keyword, departmentId: query.departmentId, positionId: query.positionId,
      status: query.status, page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order,
    }), { silent: true });
    list.value = res.list;
    total.value = res.total;
  } catch (e) {
    loadError.value = e.message;
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  Object.assign(query, { keyword: '', departmentId: null, positionId: null, status: '', page: 1, sort: '', order: '' });
  reload(1);
}

function onSortChange({ prop, order }) {
  const map = { emp_no: 'emp_no', hire_date: 'hire_date', base_salary: 'base_salary' };
  query.sort = order ? (map[prop] || '') : '';
  query.order = order === 'descending' ? 'desc' : 'asc';
  reload(1);
}

function rowClass({ row }) { return row.status === 'resigned' ? 'row-resigned' : ''; }

/* 新增 / 编辑 */
const formVisible = ref(false);
const editId = ref(null);
function openCreate() { editId.value = null; formVisible.value = true; }
function openEdit(row) { editId.value = row.id; formVisible.value = true; detailVisible.value = false; }

/* 导入 */
const importVisible = ref(false);

async function exportCsv() {
  await ElMessageBox.confirm('将按当前筛选条件导出员工数据（含敏感字段），确认导出？', '导出确认', { type: 'warning' });
  await api.download('/api/employees/export' + api.qs({
    keyword: query.keyword, departmentId: query.departmentId, status: query.status,
  }), 'employees.csv');
}

/* 详情 */
const detailVisible = ref(false);
const detail = ref(null);
async function openDetail(row) {
  try {
    detail.value = await api.get(`/api/employees/${row.id}`, { silent: true });
    detailVisible.value = true;
  } catch (e) { ElMessage.error(e.message); }
}

/* 调岗 / 离职 */
const acting = ref(false);
const transferVisible = ref(false);
const transferTarget = ref(null);
const transferForm = reactive({ departmentId: null, positionId: null, effectiveDate: '' });
function openTransfer(row) {
  transferTarget.value = row;
  Object.assign(transferForm, { departmentId: row.department_id, positionId: row.position_id, effectiveDate: '' });
  detailVisible.value = false;
  transferVisible.value = true;
}
async function submitTransfer() {
  if (!transferForm.departmentId || !transferForm.positionId) return ElMessage.warning('请选择新部门和新职位');
  await ElMessageBox.confirm(
    `确认将「${transferTarget.value.name}」调整到新岗位吗？该操作会写入审计日志。`,
    '调岗二次确认', { type: 'warning', confirmButtonText: '确认调岗' }
  );
  acting.value = true;
  try {
    await api.post(`/api/employees/${transferTarget.value.id}/transfer`, { ...transferForm });
    ElMessage.success('调岗成功');
    transferVisible.value = false;
    reload();
  } finally { acting.value = false; }
}

const resignVisible = ref(false);
const resignTarget = ref(null);
const resignDate = ref(new Date().toISOString().slice(0, 10));
function openResign(row) {
  resignTarget.value = row;
  resignDate.value = new Date().toISOString().slice(0, 10);
  detailVisible.value = false;
  resignVisible.value = true;
}
async function submitResign() {
  if (!resignDate.value) return ElMessage.warning('请选择离职日期');
  acting.value = true;
  try {
    await api.post(`/api/employees/${resignTarget.value.id}/resign`, { leaveDate: resignDate.value });
    ElMessage.success('离职办理完成');
    resignVisible.value = false;
    reload();
  } finally { acting.value = false; }
}

function onMore(cmd, row) {
  if (cmd === 'transfer') openTransfer(row);
  else if (cmd === 'resign') openResign(row);
}

onMounted(async () => { await loadOptions(); reload(1); });
</script>

<style scoped>
.emp-cell { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.emp-name { font-weight: 600; color: #1e293b; }
.emp-sub { font-size: 12px; color: #94a3b8; }
:deep(.row-resigned) { color: #94a3b8; background: #fafafa !important; }
:deep(.el-table__row) { cursor: pointer; }

.detail-head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.detail-name { font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.detail-desc { margin-bottom: 18px; }
.detail-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.table-skeleton { padding: 12px 8px; }
</style>
