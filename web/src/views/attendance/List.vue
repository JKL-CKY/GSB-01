<template>
  <div class="page-container">
    <h1 class="page-title">考勤记录</h1>
    <p class="page-sub">{{ authStore.isManager ? '按人、按月查看打卡明细与月度汇总' : '查看你本人的月度考勤明细与汇总' }}</p>

    <!-- 月度汇总卡片 -->
    <el-row :gutter="12" class="sum-row" v-loading="loading">
      <el-col :xs="12" :sm="8" :md="24 / 5" v-for="s in summaryCards" :key="s.key">
        <div class="sum-card" :style="{ borderTopColor: s.color }">
          <div class="sum-num" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="sum-label">{{ s.label }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="hrm-card">
      <div class="toolbar">
        <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" placeholder="选择月份"
          style="width:150px" @change="reload(1)" />
        <template v-if="authStore.isManager">
          <el-select v-model="query.employeeId" placeholder="全部员工" filterable clearable style="width:190px" @change="reload(1)">
            <el-option v-for="e in employees" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </template>
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width:130px" @change="reload(1)">
          <el-option v-for="(v, k) in ATT_STATUS" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-button type="primary" plain @click="reload(1)">查询</el-button>
        <div class="spacer"></div>
        <el-button v-if="authStore.isManager" :icon="Download" @click="exportCsv">导出 CSV</el-button>
      </div>

      <div class="table-wrap">
        <el-table :data="list" border stripe v-loading="loading" :element-loading-svg="undefined"
          @sort-change="onSortChange" style="width:100%"
          empty-text="该月份暂无考勤数据">
          <template #empty>
            <el-skeleton v-if="loading && !list.length" :rows="6" animated class="table-skeleton" />
            <el-empty v-else-if="!loadError" description="该月份暂无考勤数据" />
            <el-result v-else icon="error" :title="loadError" sub-title="请确认后端服务运行正常">
              <template #extra><el-button type="primary" @click="reload">重试</el-button></template>
            </el-result>
          </template>
          <el-table-column v-if="authStore.isManager" prop="employee_name" label="姓名" width="110" />
          <el-table-column v-if="authStore.isManager" prop="emp_no" label="工号" width="90" />
          <el-table-column v-if="authStore.isManager" prop="department_name" label="部门" min-width="110" />
          <el-table-column prop="work_date" label="日期" width="120" sortable="custom" />
          <el-table-column prop="check_in" label="上班打卡" width="110">
            <template #default="{ row }">{{ row.check_in || '—' }}</template>
          </el-table-column>
          <el-table-column prop="check_out" label="下班打卡" width="110">
            <template #default="{ row }">{{ row.check_out || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center" sortable="custom">
            <template #default="{ row }">
              <el-tag :type="dictType(ATT_STATUS, row.status)" effect="light" round>{{ dict(ATT_STATUS, row.status) }}</el-tag>
            </template>
          </el-table-column>
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { Download } from '@element-plus/icons-vue';
import { api, authStore } from '../../api';
import { ATT_STATUS, dict, dictType } from '../../utils/dict';

const nowMonth = new Date().toISOString().slice(0, 7);
const loading = ref(false);
const loadError = ref('');
const list = ref([]);
const total = ref(0);
const summary = ref([]);
const employees = ref([]);
const query = reactive({ month: nowMonth, employeeId: null, status: '', page: 1, pageSize: 10, sort: 'work_date', order: 'desc' });

const summaryCards = computed(() => {
  const map = Object.fromEntries(summary.value.map((x) => [x.status, x.c]));
  const colorOf = { normal: '#16a34a', late: '#d97706', early_leave: '#e6a23c', absent: '#dc2626', leave: '#64748b' };
  return ['normal', 'late', 'early_leave', 'absent', 'leave'].map((k) => ({
    key: k, label: ATT_STATUS[k].label, value: map[k] || 0, color: colorOf[k],
  }));
});

async function reload(page) {
  if (page) query.page = page;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/api/attendance' + api.qs({
      month: query.month, employeeId: query.employeeId, status: query.status,
      page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order,
    }), { silent: true });
    list.value = res.list;
    total.value = res.total;
    summary.value = res.summary;
  } catch (e) {
    loadError.value = e.message;
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function onSortChange({ prop, order }) {
  query.sort = order ? prop : 'work_date';
  query.order = order === 'descending' ? 'desc' : 'asc';
  reload(1);
}

async function exportCsv() {
  await api.download('/api/attendance/export' + api.qs({
    month: query.month, employeeId: query.employeeId, status: query.status,
  }), 'attendance.csv');
}

onMounted(async () => {
  if (authStore.isManager) {
    const res = await api.get('/api/employees?pageSize=200', { silent: true });
    employees.value = res.list;
  }
  reload(1);
});
</script>

<style scoped>
.sum-row { margin-bottom: 14px; }
.sum-card {
  background: #fff; border-radius: var(--hrm-radius); box-shadow: var(--hrm-shadow-sm);
  border-top: 3px solid #4361ee; padding: 16px 18px; margin-bottom: 12px; text-align: center;
}
.sum-num { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.sum-label { font-size: 13px; color: #64748b; margin-top: 2px; }
.table-skeleton { padding: 12px 8px; }
</style>
