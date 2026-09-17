<template>
  <div class="page-container">
    <h1 class="page-title">请假管理</h1>
    <p class="page-sub">
      {{ authStore.isManager ? '审批员工请假申请；状态严格按 草稿→待审批→通过/驳回 流转' : '提交你的请假申请，并随时跟踪审批进度' }}
    </p>

    <div class="hrm-card">
      <div class="toolbar">
        <template v-if="authStore.isManager">
          <el-input v-model="query.keyword" placeholder="搜索姓名 / 工号" clearable style="width:190px"
            :prefix-icon="Search" @keyup.enter="reload(1)" @clear="reload(1)" />
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width:130px" @change="reload(1)">
            <el-option v-for="(v, k) in LEAVE_STATUS" :key="k" :label="v.label" :value="k" />
          </el-select>
          <el-select v-model="query.leaveType" placeholder="全部类型" clearable style="width:130px" @change="reload(1)">
            <el-option v-for="(v, k) in LEAVE_TYPE" :key="k" :label="v.label" :value="k" />
          </el-select>
          <el-button type="primary" plain :icon="Search" @click="reload(1)">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetQuery">重置</el-button>
        </template>
        <template v-else>
          <el-radio-group v-model="query.status" @change="reload(1)">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="pending">待审批</el-radio-button>
            <el-radio-button value="draft">草稿</el-radio-button>
            <el-radio-button value="approved">已通过</el-radio-button>
          </el-radio-group>
        </template>
        <div class="spacer"></div>
        <el-button v-if="authStore.isManager && selected.length" type="success" plain :loading="batchLoading"
          @click="batchApprove">批量通过（{{ selected.length }}）</el-button>
        <el-button v-if="authStore.isManager" :icon="Download" @click="exportCsv">导出 CSV</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建请假</el-button>
      </div>

      <div class="table-wrap">
        <el-table :data="list" border stripe v-loading="loading" style="width:100%"
          @selection-change="(v) => selected = v" @row-click="openDetail" @sort-change="onSortChange">
          <el-table-column v-if="authStore.isManager" type="selection" width="42" :selectable="(r) => r.status === 'pending'" @click.stop />
          <el-table-column v-if="authStore.isManager" label="员工" min-width="150">
            <template #default="{ row }">
              <div class="emp-name">{{ row.employee_name }}</div>
              <div class="emp-sub">{{ row.emp_no }} · {{ row.department_name }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90" align="center">
            <template #default="{ row }">
              <el-tag effect="light" round :style="{ color: LEAVE_TYPE[row.leave_type].color, borderColor: LEAVE_TYPE[row.leave_type].color + '66' }">
                {{ dict(LEAVE_TYPE, row.leave_type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="起止时间" min-width="210" sortable="custom" prop="start_time">
            <template #default="{ row }">
              <div>{{ fmtDateTime(row.start_time) }}</div>
              <div class="emp-sub">至 {{ fmtDateTime(row.end_time) }}（{{ row.duration }} 天）</div>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="事由" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="dictType(LEAVE_STATUS, row.status)" effect="dark" round>{{ dict(LEAVE_STATUS, row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" align="right" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click.stop="openDetail(row)">详情</el-button>
              <template v-if="authStore.isManager && row.status === 'pending'">
                <el-button size="small" text type="success" @click.stop="openApprove(row, true)">通过</el-button>
                <el-button size="small" text type="danger" @click.stop="openApprove(row, false)">驳回</el-button>
              </template>
              <template v-else-if="!authStore.isManager">
                <el-button v-if="['draft','rejected'].includes(row.status)" size="small" text type="warning" @click.stop="openEdit(row)">编辑</el-button>
                <el-button v-if="row.status === 'approved'" size="small" text type="info" @click.stop="cancelLeave(row)">撤销</el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty>
            <el-skeleton v-if="loading && !list.length" :rows="6" animated class="table-skeleton" />
            <el-empty v-else-if="!loadError" description="暂无请假记录" />
            <el-result v-else icon="error" :title="loadError">
              <template #extra><el-button type="primary" @click="reload">重试</el-button></template>
            </el-result>
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

    <LeaveForm v-model="formVisible" :record="editRecord" @saved="reload()" />

    <!-- 审批弹窗 -->
    <el-dialog v-model="approveVisible" :title="approvePass ? '审批通过' : '审批驳回'" width="440px">
      <el-alert v-if="approveTarget" :type="approvePass ? 'success' : 'error'" :closable="false" show-icon style="margin-bottom:12px"
        :title="`${approveTarget.employee_name} 申请${dict(LEAVE_TYPE, approveTarget.leave_type)} ${approveTarget.duration} 天`"
        :description="approveTarget.reason" />
      <el-input v-model="approveRemark" type="textarea" :rows="3" :placeholder="approvePass ? '审批意见（可选）' : '请填写驳回原因'" />
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button :type="approvePass ? 'success' : 'danger'" :loading="acting" @click="submitApprove">
          确认{{ approvePass ? '通过' : '驳回' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉：状态机时间线 -->
    <el-drawer v-model="detailVisible" size="440px" title="请假单详情">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="申请人">{{ detail.employee_name }}（{{ detail.emp_no }}）</el-descriptions-item>
          <el-descriptions-item label="部门">{{ detail.department_name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="请假类型">{{ dict(LEAVE_TYPE, detail.leave_type) }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ fmtDateTime(detail.start_time) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ fmtDateTime(detail.end_time) }}</el-descriptions-item>
          <el-descriptions-item label="时长">{{ detail.duration }} 天</el-descriptions-item>
          <el-descriptions-item label="事由">{{ detail.reason }}</el-descriptions-item>
          <el-descriptions-item label="审批意见">{{ detail.approve_remark || '—' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="timeline-title">审批进度</h4>
        <el-timeline>
          <el-timeline-item v-for="t in timeline" :key="t.label" :type="t.type" :timestamp="t.time" :hollow="t.hollow">
            <span :class="{ 'muted': t.hollow }">{{ t.label }}</span>
          </el-timeline-item>
        </el-timeline>

        <div class="detail-actions">
          <template v-if="authStore.isManager && detail.status === 'pending'">
            <el-button type="success" @click="openApprove(detail, true)">审批通过</el-button>
            <el-button type="danger" @click="openApprove(detail, false)">驳回</el-button>
          </template>
          <el-button v-if="!authStore.isManager && ['draft','rejected'].includes(detail.status)"
            type="warning" @click="openEdit(detail)">编辑并提交</el-button>
          <el-button v-if="!authStore.isManager && detail.status === 'approved'" type="info" @click="cancelLeave(detail)">撤销申请</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, RefreshLeft, Download } from '@element-plus/icons-vue';
import { api, authStore } from '../../api';
import { LEAVE_TYPE, LEAVE_STATUS, dict, dictType, fmtDateTime } from '../../utils/dict';
import LeaveForm from './LeaveForm.vue';

const loading = ref(false);
const loadError = ref('');
const list = ref([]);
const total = ref(0);
const selected = ref([]);
const query = reactive({ keyword: '', status: '', leaveType: '', page: 1, pageSize: 10, sort: '', order: '' });

function onSortChange({ prop, order }) {
  query.sort = order ? prop : '';
  query.order = order === 'descending' ? 'desc' : 'asc';
  reload(1);
}

async function exportCsv() {
  await api.download('/api/leave-requests/export' + api.qs({
    keyword: query.keyword, status: query.status, leaveType: query.leaveType,
  }), 'leave.csv');
}

async function reload(page) {
  if (page) query.page = page;
  loading.value = true;
  loadError.value = '';
  try {
    const params = authStore.isManager
      ? { keyword: query.keyword, status: query.status, leaveType: query.leaveType, page: query.page, pageSize: query.pageSize }
      : { status: query.status, page: query.page, pageSize: query.pageSize };
    const res = await api.get('/api/leave-requests' + api.qs(params), { silent: true });
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
  Object.assign(query, { keyword: '', status: '', leaveType: '', page: 1 });
  reload(1);
}

/* 新建 / 编辑 */
const formVisible = ref(false);
const editRecord = ref(null);
function openCreate() { editRecord.value = null; formVisible.value = true; }
function openEdit(row) { editRecord.value = row; formVisible.value = true; detailVisible.value = false; }

/* 审批 */
const approveVisible = ref(false);
const approvePass = ref(true);
const approveTarget = ref(null);
const approveRemark = ref('');
const acting = ref(false);
function openApprove(row, pass) {
  approveTarget.value = row;
  approvePass.value = pass;
  approveRemark.value = '';
  approveVisible.value = true;
}
async function submitApprove() {
  if (!approvePass.value && !approveRemark.value.trim()) {
    return ElMessage.warning('驳回时请填写原因');
  }
  acting.value = true;
  try {
    await api.post(`/api/leave-requests/${approveTarget.value.id}/approve`,
      { pass: approvePass.value, remark: approveRemark.value.trim() });
    ElMessage.success(approvePass.value ? '已审批通过' : '已驳回');
    approveVisible.value = false;
    detailVisible.value = false;
    reload();
    window.__hrmRefreshTodo?.();
  } finally { acting.value = false; }
}

// 批量通过：逐条调用（每条都由后端写审计日志），二次确认
const batchLoading = ref(false);
async function batchApprove() {
  const rows = selected.value.filter((r) => r.status === 'pending');
  if (!rows.length) return;
  await ElMessageBox.confirm(
    `将批量通过选中的 ${rows.length} 份请假申请，该操作逐条写入审计日志，确认继续？`,
    '批量审批二次确认',
    { type: 'warning', confirmButtonText: '确认批量通过', cancelButtonText: '取消' }
  );
  batchLoading.value = true;
  let ok = 0;
  const fail = [];
  for (const r of rows) {
    try { await api.post(`/api/leave-requests/${r.id}/approve`, { pass: true, remark: '批量审批通过' }, { silent: true }); ok++; }
    catch { fail.push(r.employee_name || `#${r.id}`); }
  }
  batchLoading.value = false;
  ElMessage[fail.length ? 'warning' : 'success'](`批量完成：成功 ${ok} 条${fail.length ? `，失败 ${fail.length} 条（${fail.join('、')}）` : ''}`);
  reload();
  window.__hrmRefreshTodo?.();
}

/* 撤销 */
async function cancelLeave(row) {
  await ElMessageBox.confirm('确认撤销这份已通过的请假申请吗？', '撤销确认', { type: 'warning' });
  await api.post(`/api/leave-requests/${row.id}/cancel`, {});
  ElMessage.success('已撤销');
  detailVisible.value = false;
  reload();
}

/* 详情 + 状态机时间线 */
const detailVisible = ref(false);
const detail = ref(null);
async function openDetail(row) {
  try {
    detail.value = await api.get(`/api/leave-requests/${row.id}`, { silent: true });
    detailVisible.value = true;
  } catch (e) { ElMessage.error(e.message); }
}
const timeline = computed(() => {
  if (!detail.value) return [];
  const s = detail.value.status;
  const created = fmtDateTime(detail.value.created_at);
  const updated = fmtDateTime(detail.value.updated_at);
  const isTerminal = ['approved', 'rejected', 'cancelled'].includes(s);
  const items = [
    { label: '提交申请（待审批）', time: created, type: 'primary', hollow: false },
  ];
  if (s === 'draft') {
    items[0] = { label: '创建草稿', time: created, type: 'info', hollow: false };
    items.push({ label: '提交审批', type: 'warning', hollow: true });
  } else if (s === 'pending') {
    items.push({ label: '审批中，等待 HR / 管理员处理', type: 'warning', hollow: false });
  } else if (s === 'approved') {
    items.push({ label: '审批通过', time: updated, type: 'success', hollow: false });
  } else if (s === 'rejected') {
    items.push({ label: `审批驳回${detail.value.approve_remark ? '：' + detail.value.approve_remark : ''}`, time: updated, type: 'danger', hollow: false });
  } else if (s === 'cancelled') {
    items.push({ label: '审批通过', type: 'success', hollow: false });
    items.push({ label: '申请人已撤销', time: updated, type: 'info', hollow: false });
  }
  return items;
});

onMounted(() => reload(1));
</script>

<style scoped>
.emp-name { font-weight: 600; color: #1e293b; }
.emp-sub { font-size: 12px; color: #94a3b8; }
.timeline-title { margin: 22px 0 14px; color: #334155; }
.muted { color: #94a3b8; }
.detail-actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.table-skeleton { padding: 12px 8px; }
</style>
