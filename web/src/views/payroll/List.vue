<template>
  <div class="page-container">
    <h1 class="page-title">薪酬管理</h1>
    <p class="page-sub">
      {{ authStore.isManager
        ? '月度工资单的生成与维护；员工仅能查看本人工资条，所有薪资修改均写入审计日志'
        : '这里是你的月度工资条，仅你本人可见' }}
    </p>

    <div class="hrm-card" v-if="authStore.isManager">
      <div class="toolbar">
        <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" placeholder="工资月份"
          style="width:150px" @change="reload(1)" />
        <el-input v-model="query.keyword" placeholder="搜索姓名 / 工号" clearable style="width:200px"
          :prefix-icon="Search" @keyup.enter="reload(1)" @clear="reload(1)" />
        <el-tree-select v-model="query.departmentId" :data="deptTree" node-key="id"
          :props="{ label: 'name', children: 'children' }" check-strictly clearable
          placeholder="全部部门" style="width:170px" @change="reload(1)" />
        <el-button type="primary" plain :icon="Search" @click="reload(1)">查询</el-button>
        <div class="spacer"></div>
        <el-button type="success" plain :icon="MagicStick" @click="openBatch">批量生成</el-button>
        <el-button type="primary" :icon="Plus" @click="openEdit(null)">新建工资单</el-button>
        <el-button :icon="Download" @click="exportCsv">导出 CSV</el-button>
      </div>

      <div class="table-wrap">
        <el-table :data="list" border stripe v-loading="loading" style="width:100%" @sort-change="onSortChange"
          empty-text="该月份暂无工资单">
          <el-table-column label="员工" min-width="150">
            <template #default="{ row }">
              <div class="emp-name">{{ row.employee_name }}</div>
              <div class="emp-sub">{{ row.emp_no }} · {{ row.department_name }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="month" label="月份" width="95" align="center" sortable="custom" />
          <el-table-column label="基本工资" width="110" align="right">
            <template #default="{ row }">{{ fmtMoney(row.base_salary) }}</template>
          </el-table-column>
          <el-table-column label="绩效" width="100" align="right">
            <template #default="{ row }">{{ fmtMoney(row.performance) }}</template>
          </el-table-column>
          <el-table-column label="补贴" width="90" align="right">
            <template #default="{ row }">{{ fmtMoney(row.subsidy) }}</template>
          </el-table-column>
          <el-table-column label="社保" width="100" align="right" class="col-deduct">
            <template #default="{ row }">-{{ fmtMoney(row.social_insurance) }}</template>
          </el-table-column>
          <el-table-column label="公积金" width="100" align="right" class="col-deduct">
            <template #default="{ row }">-{{ fmtMoney(row.housing_fund) }}</template>
          </el-table-column>
          <el-table-column label="个税" width="95" align="right" class="col-deduct">
            <template #default="{ row }">-{{ fmtMoney(row.tax) }}</template>
          </el-table-column>
          <el-table-column label="实发工资" width="130" align="right" prop="net_salary" sortable="custom">
            <template #default="{ row }"><span class="money net">{{ fmtMoney(row.net_salary) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="90" align="right" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="warning" @click="openEdit(row)">编辑</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-skeleton v-if="loading && !list.length" :rows="6" animated class="table-skeleton" />
            <el-empty v-else-if="!loadError" description="该月份暂无工资单，可点击「批量生成」" />
            <el-result v-else icon="error" :title="loadError">
              <template #extra><el-button type="primary" @click="reload">重试</el-button></template>
            </el-result>
          </template>
        </el-table>
      </div>
      <div class="pagination-bar">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="reload()" @size-change="reload(1)" />
      </div>
    </div>

    <!-- 员工自助：工资条卡片列表 -->
    <el-row v-else :gutter="16" v-loading="loading">
      <el-col :xs="24" :sm="12" :md="8" v-for="p in list" :key="p.id">
        <div class="payslip-card" @click="openSlip(p)">
          <div class="slip-top">
            <span class="slip-month">{{ p.month }}</span>
            <el-tag type="success" effect="light" size="small">已发放</el-tag>
          </div>
          <div class="slip-net"><span class="money">{{ fmtMoney(p.net_salary) }}</span></div>
          <div class="slip-sub">基本工资 {{ fmtMoney(p.base_salary) }} · 绩效 {{ fmtMoney(p.performance) }}</div>
          <div class="slip-open">查看工资条明细 <el-icon><ArrowRight /></el-icon></div>
        </div>
      </el-col>
      <el-col :span="24" v-if="!loading && !list.length">
        <el-empty description="暂时还没有你的工资条" />
      </el-col>
      <el-col :span="24" v-if="loadError">
        <el-result icon="error" :title="loadError">
          <template #extra><el-button type="primary" @click="reload">重试</el-button></template>
        </el-result>
      </el-col>
    </el-row>

    <!-- 新建 / 编辑工资单 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑工资单' : '新建工资单'" width="520px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="员工" required>
          <el-select v-model="form.employeeId" filterable :disabled="!!form.id" placeholder="选择在职员工" style="width:100%">
            <el-option v-for="e in employees" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="工资月份" required>
          <el-date-picker v-model="form.month" type="month" value-format="YYYY-MM" :disabled="!!form.id" style="width:100%" />
        </el-form-item>
        <el-form-item label="基本工资"><el-input-number v-model="form.baseSalary" :min="0" :precision="2" :step="500" style="width:100%" /></el-form-item>
        <el-form-item label="绩效工资"><el-input-number v-model="form.performance" :min="0" :precision="2" :step="200" style="width:100%" /></el-form-item>
        <el-form-item label="补贴"><el-input-number v-model="form.subsidy" :min="0" :precision="2" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="社保（个人）"><el-input-number v-model="form.socialInsurance" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="公积金（个人）"><el-input-number v-model="form.housingFund" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="个税"><el-input-number v-model="form.tax" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-divider />
        <el-form-item label="实发工资（自动）">
          <span class="money net" style="font-size:18px">{{ fmtMoney(netCalc) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存（写入审计日志）</el-button>
      </template>
    </el-dialog>

    <!-- 批量生成 -->
    <el-dialog v-model="batchVisible" title="批量生成月度工资单" width="440px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:14px"
        title="将按每位在职员工当前基本工资自动计算各项金额；该月份已有工资单的员工会自动跳过，不会覆盖。" />
      <el-form label-width="92px">
        <el-form-item label="工资月份">
          <el-date-picker v-model="batchMonth" type="month" value-format="YYYY-MM" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="doBatch">确认生成</el-button>
      </template>
    </el-dialog>

    <!-- 工资条明细（员工视角） -->
    <el-dialog v-model="slipVisible" :title="`${slip.month || ''} 工资条`" width="460px" align-center>
      <div class="slip-paper" v-if="slip.month">
        <div class="paper-head">
          <div class="paper-logo"><el-icon><OfficeBuilding /></el-icon> 智汇 HRM</div>
          <div>{{ slip.employee_name }}（{{ slip.emp_no }}）· {{ slip.department_name }}</div>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="基本工资">{{ fmtMoney(slip.base_salary) }}</el-descriptions-item>
          <el-descriptions-item label="绩效工资">{{ fmtMoney(slip.performance) }}</el-descriptions-item>
          <el-descriptions-item label="补贴">{{ fmtMoney(slip.subsidy) }}</el-descriptions-item>
          <el-descriptions-item label="社保个人">-{{ fmtMoney(slip.social_insurance) }}</el-descriptions-item>
          <el-descriptions-item label="公积金个人">-{{ fmtMoney(slip.housing_fund) }}</el-descriptions-item>
          <el-descriptions-item label="个税">-{{ fmtMoney(slip.tax) }}</el-descriptions-item>
        </el-descriptions>
        <div class="paper-net">
          <span>实发工资</span>
          <span class="money" style="font-size:24px;color:#16a34a">{{ fmtMoney(slip.net_salary) }}</span>
        </div>
        <div class="paper-foot">本工资条为系统自动生成的保密信息，请勿外传</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Download, MagicStick, ArrowRight } from '@element-plus/icons-vue';
import { api, authStore } from '../../api';
import { useOptions } from '../../composables/useOptions';
import { fmtMoney } from '../../utils/dict';

const { deptTree, loadOptions } = useOptions();
const loading = ref(false);
const loadError = ref('');
const list = ref([]);
const total = ref(0);
const employees = ref([]);
const thisMonth = new Date().toISOString().slice(0, 7);
const query = reactive({ month: '', keyword: '', departmentId: null, page: 1, pageSize: 10, sort: '', order: '' });

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
    const res = await api.get('/api/payrolls' + api.qs({
      month: query.month, keyword: query.keyword, departmentId: query.departmentId,
      page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order,
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

/* ---------- 新建 / 编辑 ---------- */
const editVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, employeeId: null, month: '', baseSalary: 0, performance: 0, subsidy: 500, socialInsurance: 0, housingFund: 0, tax: 0 });
const netCalc = computed(() => {
  const v = +form.baseSalary + +form.performance + +form.subsidy - +form.socialInsurance - +form.housingFund - +form.tax;
  return Math.max(0, Math.round(v * 100) / 100);
});

function openEdit(row) {
  if (row) {
    Object.assign(form, {
      id: row.id, employeeId: row.employee_id, month: row.month,
      baseSalary: row.base_salary, performance: row.performance, subsidy: row.subsidy,
      socialInsurance: row.social_insurance, housingFund: row.housing_fund, tax: row.tax,
    });
  } else {
    Object.assign(form, { id: null, employeeId: null, month: query.month || thisMonth, baseSalary: 8000, performance: 1000, subsidy: 500, socialInsurance: 800, housingFund: 500, tax: 0 });
  }
  editVisible.value = true;
}

async function save() {
  if (!form.employeeId || !form.month) return ElMessage.warning('请选择员工和工资月份');
  await ElMessageBox.confirm(
    form.id ? '保存将修改该员工当月工资，操作会写入审计日志，确认继续？' : '确认生成该员工当月工资单？',
    '薪资操作二次确认', { type: 'warning', confirmButtonText: '确认保存' }
  );
  saving.value = true;
  try {
    if (form.id) await api.put(`/api/payrolls/${form.id}`, { ...form });
    else await api.post('/api/payrolls', { ...form });
    ElMessage.success('保存成功');
    editVisible.value = false;
    reload();
  } finally { saving.value = false; }
}

/* ---------- 批量生成 ---------- */
const batchVisible = ref(false);
const batchMonth = ref(thisMonth);
function openBatch() { batchMonth.value = query.month || thisMonth; batchVisible.value = true; }
async function doBatch() {
  if (!batchMonth.value) return ElMessage.warning('请选择月份');
  await ElMessageBox.confirm(
    `将为所有在职员工生成 ${batchMonth.value} 工资单（已有则跳过），确认执行？`,
    '批量操作二次确认', { type: 'warning', confirmButtonText: '确认生成' }
  );
  saving.value = true;
  try {
    const r = await api.post('/api/payrolls/batch-generate', { month: batchMonth.value });
    ElMessage.success(r.message);
    batchVisible.value = false;
    query.month = batchMonth.value;
    reload(1);
  } finally { saving.value = false; }
}

async function exportCsv() {
  await api.download('/api/payrolls/export/csv' + api.qs({ month: query.month }), `payroll_${query.month}.csv`);
}

/* ---------- 员工工资条 ---------- */
const slipVisible = ref(false);
const slip = ref({});
async function openSlip(p) {
  slip.value = await api.get(`/api/payrolls/${p.id}`, { silent: true });
  slipVisible.value = true;
}

onMounted(async () => {
  if (authStore.isManager) {
    query.month = thisMonth; // 管理端默认看当前月；员工端默认展示全部月份的工资条
    await loadOptions();
    const res = await api.get('/api/employees?pageSize=200', { silent: true });
    employees.value = res.list.filter((e) => e.status !== 'resigned');
  }
  reload(1);
});
</script>

<style scoped>
.emp-name { font-weight: 600; color: #1e293b; }
.emp-sub { font-size: 12px; color: #94a3b8; }
:deep(.col-deduct) { color: #dc2626; }
.net { color: #16a34a; }

.payslip-card {
  background: linear-gradient(135deg, #4361ee, #5b8def);
  color: #fff; border-radius: 14px; padding: 20px; margin-bottom: 16px;
  cursor: pointer; box-shadow: var(--hrm-shadow-sm); transition: transform .18s;
}
.payslip-card:hover { transform: translateY(-3px); }
.slip-top { display: flex; justify-content: space-between; align-items: center; }
.slip-month { font-weight: 700; font-size: 15px; }
.slip-net { font-size: 26px; font-weight: 800; margin: 14px 0 4px; font-variant-numeric: tabular-nums; }
.slip-net :deep(.money::before) { color: rgba(255,255,255,.7); }
.slip-sub { font-size: 12px; opacity: .85; }
.slip-open { margin-top: 14px; font-size: 13px; display: flex; align-items: center; gap: 4px; opacity: .92; }

.slip-paper { border: 1px solid #e5e9f2; border-radius: 12px; padding: 20px; }
.paper-head { text-align: center; margin-bottom: 16px; }
.paper-logo { font-size: 18px; font-weight: 800; color: #312e81; display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 6px; }
.paper-net { display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border-radius: 10px; padding: 14px 16px; margin-top: 14px; font-weight: 700; }
.paper-foot { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 14px; }
.table-skeleton { padding: 12px 8px; }
</style>
