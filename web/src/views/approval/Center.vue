<template>
  <div class="page-container">
    <h1 class="page-title">审批中心</h1>
    <p class="page-sub">集中处理转正与调薪申请；调薪审批仅管理员可操作，通过后自动更新员工档案</p>

    <el-tabs v-model="tab" class="center-tabs">
      <!-- 转正 -->
      <el-tab-pane name="regular">
        <template #label>
          <span>转正审批 <el-badge v-if="counts.regular" :value="counts.regular" :max="99" class="tab-badge" /></span>
        </template>
        <div class="hrm-card">
          <div class="toolbar">
            <el-radio-group v-model="regularStatus" @change="loadRegular(1)">
              <el-radio-button value="">全部</el-radio-button>
              <el-radio-button value="pending">待审批</el-radio-button>
              <el-radio-button value="approved">已通过</el-radio-button>
              <el-radio-button value="rejected">已驳回</el-radio-button>
            </el-radio-group>
            <el-button v-if="canCreateRegular" type="primary" :icon="Plus" @click="openCreateRegular">代员工发起转正</el-button>
          </div>
          <div class="table-wrap">
            <el-table :data="regularList" border stripe v-loading="loadingRegular" style="width:100%" empty-text="暂无转正申请">
              <el-table-column label="员工" min-width="160">
                <template #default="{ row }">
                  <div class="emp-name">{{ row.employee_name }}</div>
                  <div class="emp-sub">{{ row.emp_no }} · {{ row.department_name }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="expected_date" label="期望转正日期" width="140" />
              <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="dictType(APPROVAL_STATUS, row.status)" effect="dark" round>{{ dict(APPROVAL_STATUS, row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="approver_name" label="审批人" width="110">
                <template #default="{ row }">{{ row.approver_name || '—' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="180" align="right">
                <template #default="{ row }">
                  <template v-if="row.status === 'pending'">
                    <el-button size="small" text type="success" @click="approve(row, true, 'regular')">通过</el-button>
                    <el-button size="small" text type="danger" @click="approve(row, false, 'regular')">驳回</el-button>
                  </template>
                  <span v-else class="emp-sub">{{ row.approve_remark || '已处理' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="pagination-bar">
            <el-pagination v-model:current-page="regularPage" :total="regularTotal" :page-size="regularPageSize"
              layout="total, prev, pager, next" @current-change="loadRegular()" />
          </div>
        </div>
      </el-tab-pane>

      <!-- 调薪 -->
      <el-tab-pane name="adjustment">
        <template #label>
          <span>调薪审批 <el-badge v-if="counts.adjustment" :value="counts.adjustment" :max="99" class="tab-badge" /></span>
        </template>
        <div class="hrm-card">
          <div class="toolbar">
            <el-radio-group v-model="adjustStatus" @change="loadAdjust(1)">
              <el-radio-button value="">全部</el-radio-button>
              <el-radio-button value="pending">待审批</el-radio-button>
              <el-radio-button value="approved">已通过</el-radio-button>
              <el-radio-button value="rejected">已驳回</el-radio-button>
            </el-radio-group>
            <el-button type="primary" :icon="Plus" @click="openCreateAdjust">发起调薪</el-button>
          </div>
          <div class="table-wrap">
            <el-table :data="adjustList" border stripe v-loading="loadingAdjust" style="width:100%" empty-text="暂无调薪申请">
              <el-table-column label="员工" min-width="150">
                <template #default="{ row }">
                  <div class="emp-name">{{ row.employee_name }}</div>
                  <div class="emp-sub">{{ row.emp_no }} · {{ row.department_name }}</div>
                </template>
              </el-table-column>
              <el-table-column label="当前薪资" width="120" align="right">
                <template #default="{ row }"><span class="money">{{ fmtMoney(row.old_salary) }}</span></template>
              </el-table-column>
              <el-table-column label="调整后" width="130" align="right">
                <template #default="{ row }">
                  <span class="money" style="color:#16a34a">{{ fmtMoney(row.new_salary) }}</span>
                  <el-tag size="small" :type="row.new_salary > row.old_salary ? 'success' : 'danger'" effect="plain" class="rise-tag">
                    {{ row.new_salary > row.old_salary ? '+' : '' }}{{ (((row.new_salary - row.old_salary) / row.old_salary) * 100).toFixed(1) }}%
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="effective_month" label="生效月份" width="110" align="center" />
              <el-table-column prop="reason" label="原因" min-width="160" show-overflow-tooltip />
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="dictType(APPROVAL_STATUS, row.status)" effect="dark" round>{{ dict(APPROVAL_STATUS, row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180" align="right">
                <template #default="{ row }">
                  <template v-if="row.status === 'pending'">
                    <el-button v-if="role === 'admin'" size="small" text type="success" @click="approve(row, true, 'adjust')">通过</el-button>
                    <el-button v-if="role === 'admin'" size="small" text type="danger" @click="approve(row, false, 'adjust')">驳回</el-button>
                    <el-tag v-else size="small" type="info" effect="plain">仅管理员可审批</el-tag>
                  </template>
                  <span v-else class="emp-sub">{{ row.approve_remark || '已处理' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="pagination-bar">
            <el-pagination v-model:current-page="adjustPage" :total="adjustTotal" :page-size="adjustPageSize"
              layout="total, prev, pager, next" @current-change="loadAdjust()" />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 代发起转正 -->
    <el-dialog v-model="regularDlg" title="代员工发起转正" width="440px">
      <el-form label-width="100px">
        <el-form-item label="试用期员工">
          <el-select v-model="regularForm.employeeId" filterable placeholder="选择试用期员工" style="width:100%">
            <el-option v-for="e in probationEmps" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="期望日期">
          <el-date-picker v-model="regularForm.expectedDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="regularForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="regularDlg = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitCreateRegular">提交</el-button>
      </template>
    </el-dialog>

    <!-- 发起调薪 -->
    <el-dialog v-model="adjustDlg" title="发起调薪申请" width="460px">
      <el-form label-width="96px">
        <el-form-item label="员工">
          <el-select v-model="adjustForm.employeeId" filterable placeholder="选择在职员工" style="width:100%" @change="onPickEmp">
            <el-option v-for="e in activeEmps" :key="e.id"
              :label="`${e.name}（${e.emp_no}）当前 ${fmtMoney(e.base_salary)}`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="调整后薪资">
          <el-input-number v-model="adjustForm.newSalary" :min="0" :precision="2" :step="500" style="width:100%" />
        </el-form-item>
        <el-form-item label="生效月份">
          <el-date-picker v-model="adjustForm.effectiveMonth" type="month" value-format="YYYY-MM" style="width:100%" />
        </el-form-item>
        <el-form-item label="调薪原因">
          <el-input v-model="adjustForm.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDlg = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitCreateAdjust">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api, authStore } from '../../api';
import { APPROVAL_STATUS, dict, dictType, fmtMoney } from '../../utils/dict';

const role = computed(() => authStore.role);
const tab = ref('regular');

const counts = reactive({ regular: 0, adjustment: 0 });

/* ---------- 转正 ---------- */
const loadingRegular = ref(false);
const regularList = ref([]);
const regularTotal = ref(0);
const regularPage = ref(1);
const regularPageSize = 10;
const regularStatus = ref('pending');
const probationEmps = ref([]);
const canCreateRegular = computed(() => authStore.isManager);

async function loadRegular(page) {
  if (page) regularPage.value = page;
  loadingRegular.value = true;
  try {
    const res = await api.get('/api/approvals/regular' + api.qs({
      status: regularStatus.value, page: regularPage.value, pageSize: regularPageSize,
    }), { silent: true });
    regularList.value = res.list;
    regularTotal.value = res.total;
  } finally { loadingRegular.value = false; }
}

const regularDlg = ref(false);
const regularForm = reactive({ employeeId: null, expectedDate: '', remark: '' });
function openCreateRegular() {
  Object.assign(regularForm, { employeeId: null, expectedDate: '', remark: '' });
  regularDlg.value = true;
}
async function submitCreateRegular() {
  if (!regularForm.employeeId || !regularForm.expectedDate) return ElMessage.warning('请完善信息');
  await api.post('/api/approvals/regular', { ...regularForm });
  ElMessage.success('已发起转正申请');
  regularDlg.value = false;
  loadRegular(1);
  refreshCounts();
}

/* ---------- 调薪 ---------- */
const loadingAdjust = ref(false);
const adjustList = ref([]);
const adjustTotal = ref(0);
const adjustPage = ref(1);
const adjustPageSize = 10;
const adjustStatus = ref('pending');
const activeEmps = ref([]);

async function loadAdjust(page) {
  if (page) adjustPage.value = page;
  loadingAdjust.value = true;
  try {
    const res = await api.get('/api/approvals/adjustment' + api.qs({
      status: adjustStatus.value, page: adjustPage.value, pageSize: adjustPageSize,
    }), { silent: true });
    adjustList.value = res.list;
    adjustTotal.value = res.total;
  } finally { loadingAdjust.value = false; }
}

const adjustDlg = ref(false);
const acting = ref(false);
const adjustForm = reactive({ employeeId: null, newSalary: 0, effectiveMonth: '', reason: '' });
function openCreateAdjust() {
  Object.assign(adjustForm, { employeeId: null, newSalary: 0, effectiveMonth: new Date().toISOString().slice(0, 7), reason: '' });
  adjustDlg.value = true;
}
function onPickEmp(id) {
  const e = activeEmps.value.find((x) => x.id === id);
  if (e) adjustForm.newSalary = e.base_salary;
}
async function submitCreateAdjust() {
  if (!adjustForm.employeeId || !adjustForm.newSalary || !adjustForm.effectiveMonth) return ElMessage.warning('请完善信息');
  await api.post('/api/approvals/adjustment', { ...adjustForm });
  ElMessage.success('调薪申请已提交，等待管理员审批');
  adjustDlg.value = false;
  loadAdjust(1);
  refreshCounts();
}

/* ---------- 通用审批（二次确认 + 必填驳回原因） ---------- */
async function approve(row, pass, kind) {
  let remark = '';
  if (pass) {
    const r = await ElMessageBox.prompt(
      `确认${kind === 'regular' ? '通过该转正申请' : '通过该调薪申请（通过后立即更新员工基本工资）'}吗？可填写审批意见。`,
      '审批二次确认',
      { confirmButtonText: '确认通过', cancelButtonText: '取消', inputPlaceholder: '审批意见（可选）', inputValue: '', type: 'warning' }
    ).catch(() => null);
    if (!r) return;
    remark = r.value || '';
  } else {
    const r = await ElMessageBox.prompt('请填写驳回原因', '驳回申请', {
      confirmButtonText: '确认驳回', cancelButtonText: '取消',
      inputPlaceholder: '驳回原因（必填）', inputValidator: (v) => (v && v.trim() ? true : '驳回原因不能为空'),
      confirmButtonClass: 'el-button--danger', type: 'error',
    }).catch(() => null);
    if (!r) return;
    remark = r.value;
  }
  acting.value = true;
  try {
    await api.post(`/api/approvals/${kind}/${row.id}/approve`, { pass, remark });
    ElMessage.success(pass ? '已审批通过' : '已驳回');
    loadRegular();
    loadAdjust();
    refreshCounts();
    window.__hrmRefreshTodo?.();
  } finally { acting.value = false; }
}

async function refreshCounts() {
  try {
    const d = await api.get('/api/dashboard', { silent: true });
    counts.regular = d.pending.regular;
    counts.adjustment = d.pending.adjustment;
  } catch { /* ignore */ }
}

onMounted(async () => {
  loadRegular(1);
  loadAdjust(1);
  refreshCounts();
  if (authStore.isManager) {
    const [prob, act] = await Promise.all([
      api.get('/api/employees?pageSize=200&status=probation', { silent: true }),
      api.get('/api/employees?pageSize=200&status=regular', { silent: true }),
    ]);
    probationEmps.value = prob.list;
    activeEmps.value = [...prob.list, ...act.list];
  }
});
</script>

<style scoped>
.tab-badge { margin-left: 6px; }
.tab-badge :deep(.el-badge__content) { transform: translateY(-2px); }
.emp-name { font-weight: 600; color: #1e293b; }
.emp-sub { font-size: 12px; color: #94a3b8; }
.rise-tag { margin-left: 6px; }
</style>
