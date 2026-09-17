<template>
  <div class="page-container">
    <h1 class="page-title">审计日志</h1>
    <p class="page-sub">记录谁、在什么时间、对什么数据、做了什么；日志只追加，任何人都无法在系统内篡改或删除</p>

    <div class="hrm-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="搜索操作人 / 动作 / 对象 / 内容" clearable style="width:260px"
          :prefix-icon="Search" @keyup.enter="reload(1)" @clear="reload(1)" />
        <el-select v-model="query.action" placeholder="操作类型" clearable filterable style="width:210px" @change="reload(1)">
          <el-option v-for="a in actions" :key="a" :label="actionLabel(a)" :value="a" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期"
          end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width:260px" @change="onDateChange" />
        <el-button type="primary" plain :icon="Search" @click="reload(1)">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
      </div>

      <div class="table-wrap">
        <el-table :data="list" border stripe v-loading="loading" style="width:100%" @sort-change="onSortChange">
          <el-table-column prop="created_at" label="时间" width="170" sortable="custom" />
          <el-table-column label="操作人" width="150" prop="username" sortable="custom">
            <template #default="{ row }">
              <div class="u-name">{{ row.username }}</div>
              <el-tag size="small" :type="dictType(ROLE, row.role)" effect="plain">{{ dict(ROLE, row.role) || row.role }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="动作" width="200" prop="action" sortable="custom">
            <template #default="{ row }">
              <el-tag :type="actionTone(row.action)" effect="light" size="small">{{ actionLabel(row.action) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="target" label="操作对象" width="120" show-overflow-tooltip />
          <el-table-column prop="detail" label="操作内容" min-width="280" show-overflow-tooltip />
          <el-table-column prop="ip" label="IP" width="120" />
          <template #empty>
            <el-skeleton v-if="loading && !list.length" :rows="6" animated class="table-skeleton" />
            <el-empty v-else-if="!loadError" description="暂无日志" />
            <el-result v-else icon="error" :title="loadError">
              <template #extra><el-button type="primary" @click="reload">重试</el-button></template>
            </el-result>
          </template>
        </el-table>
      </div>
      <div class="pagination-bar">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="reload()" @size-change="reload(1)" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { Search, RefreshLeft } from '@element-plus/icons-vue';
import { api } from '../../api';
import { ROLE, dict, dictType } from '../../utils/dict';

const loading = ref(false);
const loadError = ref('');
const list = ref([]);
const total = ref(0);
const actions = ref([]);
const dateRange = ref([]);
const query = reactive({ keyword: '', action: '', startDate: '', endDate: '', page: 1, pageSize: 20, sort: '', order: '' });

function onSortChange({ prop, order }) {
  query.sort = order ? prop : '';
  query.order = order === 'descending' ? 'desc' : 'asc';
  reload(1);
}

const ACTION_MAP = {
  'auth.login': { label: '登录', tone: 'primary' },
  'auth.changePassword': { label: '修改密码', tone: 'info' },
  'department.create': { label: '新增部门', tone: 'success' },
  'department.update': { label: '编辑部门', tone: 'warning' },
  'department.delete': { label: '删除部门', tone: 'danger' },
  'position.create': { label: '新增职位', tone: 'success' },
  'position.update': { label: '编辑职位', tone: 'warning' },
  'position.delete': { label: '删除职位', tone: 'danger' },
  'employee.create': { label: '新增员工', tone: 'success' },
  'employee.update': { label: '编辑员工档案', tone: 'warning' },
  'employee.import': { label: '批量导入员工', tone: 'success' },
  'employee.export': { label: '导出员工', tone: 'info' },
  'employee.resign': { label: '员工离职', tone: 'danger' },
  'employee.transfer': { label: '员工调岗', tone: 'warning' },
  'employee.selfUpdate': { label: '员工更新资料', tone: 'info' },
  'leave.create': { label: '提交请假', tone: 'primary' },
  'leave.update': { label: '修改请假', tone: 'warning' },
  'leave.submit': { label: '提交审批', tone: 'primary' },
  'leave.approve': { label: '请假审批', tone: 'success' },
  'leave.cancel': { label: '撤销请假', tone: 'info' },
  'regular.create': { label: '发起转正', tone: 'primary' },
  'regular.approve': { label: '转正审批', tone: 'success' },
  'adjustment.create': { label: '发起调薪', tone: 'primary' },
  'adjustment.approve': { label: '调薪审批', tone: 'success' },
  'payroll.create': { label: '生成工资单', tone: 'success' },
  'payroll.update': { label: '修改工资单', tone: 'warning' },
  'payroll.batchGenerate': { label: '批量生成工资', tone: 'success' },
  'payroll.export': { label: '导出工资', tone: 'info' },
  'attendance.export': { label: '导出考勤', tone: 'info' },
  'user.create': { label: '新建用户', tone: 'success' },
  'user.update': { label: '编辑用户', tone: 'warning' },
  'user.resetPassword': { label: '重置密码', tone: 'warning' },
  'user.toggle': { label: '启停用用户', tone: 'danger' },
  'system.init': { label: '系统初始化', tone: 'info' },
  'system.resetDemo': { label: '重置演示数据', tone: 'danger' },
};

function actionLabel(a) { return ACTION_MAP[a]?.label || a; }
function actionTone(a) { return ACTION_MAP[a]?.tone || 'info'; }

function onDateChange(v) {
  query.startDate = v?.[0] || '';
  query.endDate = v?.[1] || '';
  reload(1);
}
function reset() {
  Object.assign(query, { keyword: '', action: '', startDate: '', endDate: '', page: 1, sort: '', order: '' });
  dateRange.value = [];
  reload(1);
}

async function reload(page) {
  if (page) query.page = page;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/api/system/audit-logs' + api.qs(query), { silent: true });
    list.value = res.list;
    total.value = res.total;
    actions.value = res.actions;
  } catch (e) {
    loadError.value = e.message;
    list.value = [];
  } finally { loading.value = false; }
}

onMounted(() => reload(1));
</script>

<style scoped>
.u-name { font-weight: 600; font-size: 13.5px; }
.table-skeleton { padding: 12px 8px; }
</style>
