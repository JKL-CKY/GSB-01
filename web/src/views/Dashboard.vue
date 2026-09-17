<template>
  <div class="page-container">
    <h1 class="page-title">工作台</h1>
    <p class="page-sub">{{ greeting }}，{{ authStore.user?.name }}，这是今天的组织概况</p>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="12" :md="6" v-for="c in cards" :key="c.key">
        <div class="stat-card" :style="{ background: c.bg }">
          <div class="stat-icon" :style="{ background: c.color }"><el-icon :size="22" color="#fff"><component :is="c.icon" /></el-icon></div>
          <div class="stat-meta">
            <div class="stat-value">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="14">
        <div class="hrm-card chart-card">
          <div class="card-head">
            <span class="card-title">近 6 个月入离职趋势</span>
            <el-radio-group v-model="trendMode" size="small">
              <el-radio-button value="both">全部</el-radio-button>
              <el-radio-button value="hires">入职</el-radio-button>
              <el-radio-button value="leaves">离职</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="trendEl" class="chart-box"></div>
        </div>
      </el-col>
      <el-col :xs="24" :md="10">
        <div class="hrm-card chart-card">
          <div class="card-head"><span class="card-title">部门人数分布</span></div>
          <div ref="pieEl" class="chart-box"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" v-if="authStore.isManager">
      <el-col :span="24">
        <div class="hrm-card">
          <div class="card-head">
            <span class="card-title">待办审批</span>
            <el-button text type="primary" @click="$router.push('/leave')">前往处理 <el-icon><ArrowRight /></el-icon></el-button>
          </div>
          <el-table :data="todoTable" v-loading="loading" empty-text="暂无待办审批" stripe>
            <el-table-column label="类型" width="120">
              <template #default="{ row }"><el-tag :type="row.type" effect="light">{{ row.label }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="text" label="事项" />
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" text @click="$router.push(row.path)">去审批</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <el-alert
      v-if="loadError"
      class="retry-alert"
      type="error"
      :closable="false"
      show-icon
      title="仪表盘数据加载失败"
      :description="loadError"
    >
      <el-button size="small" type="primary" @click="load">重试</el-button>
    </el-alert>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { api, authStore } from '../api';

const loading = ref(true);
const loadError = ref('');
const data = ref(null);
const trendMode = ref('both');
const trendEl = ref();
const pieEl = ref();
let trendChart = null;
let pieChart = null;

const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
});

const cards = computed(() => {
  const s = data.value?.stats;
  return [
    { key: 'total', label: '在职员工总数', value: s?.total ?? '-', icon: 'User', color: '#4361ee', bg: 'linear-gradient(135deg,#eef2ff,#fff)' },
    { key: 'probation', label: '试用期员工', value: s?.probation ?? '-', icon: 'Clock', color: '#d97706', bg: 'linear-gradient(135deg,#fff7ed,#fff)' },
    { key: 'pending', label: authStore.isManager ? '待办审批' : '我的审批中', value: s?.pendingApprovals ?? '-', icon: 'Stamp', color: '#dc2626', bg: 'linear-gradient(135deg,#fef2f2,#fff)' },
    { key: 'leave', label: '近一年离职人数', value: s?.resignedYear ?? '-', icon: 'Switch', color: '#64748b', bg: 'linear-gradient(135deg,#f1f5f9,#fff)' },
  ];
});

const todoTable = computed(() => {
  if (!data.value) return [];
  const p = data.value.pending;
  const rows = [];
  if (p.leave) rows.push({ label: '请假审批', type: 'warning', text: `${p.leave} 份请假申请等待审批`, path: '/leave' });
  if (p.regular) rows.push({ label: '转正审批', type: 'primary', text: `${p.regular} 份转正申请等待审批`, path: '/approvals' });
  if (p.adjustment) rows.push({ label: '调薪审批', type: 'danger', text: `${p.adjustment} 份调薪申请等待审批`, path: '/approvals' });
  return rows;
});

const PALETTE = ['#4361ee', '#0891b2', '#7c3aed', '#d97706', '#16a34a', '#db2777', '#65a30d', '#dc2626'];

function renderTrend() {
  if (!data.value || !trendEl.value) return;
  if (!trendChart) trendChart = echarts.init(trendEl.value);
  const t = data.value.hireLeaveTrend;
  const series = [];
  if (trendMode.value !== 'leaves') {
    series.push({
      name: '入职', type: 'bar', data: t.map((x) => x.hires),
      itemStyle: { color: '#4361ee', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26,
    });
  }
  if (trendMode.value !== 'hires') {
    series.push({
      name: '离职', type: 'line', smooth: true, data: t.map((x) => x.leaves),
      symbolSize: 8, lineStyle: { width: 3, color: '#f56c6c' }, itemStyle: { color: '#f56c6c' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(245,108,108,.25)' }, { offset: 1, color: 'rgba(245,108,108,.02)' }]) },
    });
  }
  trendChart.setOption({
    color: PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { right: 0, top: 0, data: series.map((s) => s.name) },
    grid: { left: 36, right: 16, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: t.map((x) => x.month.slice(2)), axisLine: { lineStyle: { color: '#cbd5e1' } } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series,
  }, true);
}

function renderPie() {
  if (!data.value || !pieEl.value) return;
  if (!pieChart) pieChart = echarts.init(pieEl.value);
  pieChart.setOption({
    color: PALETTE,
    tooltip: { trigger: 'item', formatter: '{b}：{c} 人（{d}%）' },
    legend: { bottom: 0, icon: 'circle', textStyle: { color: '#64748b' } },
    series: [{
      type: 'pie', radius: ['46%', '70%'], center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 6 },
      label: { formatter: '{b}\n{c}人', color: '#475569', fontSize: 12 },
      data: data.value.deptDistribution,
    }],
  });
}

function onResize() { trendChart?.resize(); pieChart?.resize(); }

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    data.value = await api.get('/api/dashboard', { silent: true });
    await nextTick();
    renderTrend();
    renderPie();
  } catch (e) {
    loadError.value = e.message;
  } finally {
    loading.value = false;
  }
}

import { watch } from 'vue';
watch(trendMode, renderTrend);

onMounted(load);
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  trendChart?.dispose();
  pieChart?.dispose();
});
window.addEventListener('resize', onResize);
</script>

<style scoped>
.stat-row { margin-bottom: 16px; }
.stat-card {
  border-radius: var(--hrm-radius);
  padding: 20px;
  display: flex; align-items: center; gap: 16px;
  box-shadow: var(--hrm-shadow-sm);
  border: 1px solid #eef1f8;
  margin-bottom: 16px;
  transition: transform .18s, box-shadow .18s;
}
.stat-card:hover { transform: translateY(-3px); box-shadow: var(--hrm-shadow); }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.stat-value { font-size: 28px; font-weight: 800; color: #1e293b; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 2px; }

.chart-row { margin-bottom: 16px; }
.chart-card { margin-bottom: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.card-title { font-size: 15.5px; font-weight: 700; color: #1e293b; }
.chart-box { height: 320px; }
.retry-alert { margin-top: 8px; }
</style>
