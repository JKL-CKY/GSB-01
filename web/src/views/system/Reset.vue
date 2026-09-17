<template>
  <div class="page-container">
    <h1 class="page-title">演示数据</h1>
    <p class="page-sub">数据被你玩乱了？一键恢复到初始演示状态（该操作仅管理员可用，会清空并重建全部业务数据）</p>

    <div class="hrm-card reset-card">
      <el-icon :size="40" color="#dc2626"><RefreshRight /></el-icon>
      <h3>一键重置演示数据</h3>
      <p>
        重置内容：8 个部门、11 个职位、16 名员工、近 3 个月考勤与工资数据、<br />
        示例请假 / 转正 / 调薪申请；三个演示账号密码也会恢复为初始密码。
      </p>
      <el-alert type="error" :closable="false" show-icon style="max-width:520px;margin:6px 0 18px"
        title="危险操作：当前所有业务数据将被清空并重建，且不可恢复，请先确认没有需要保留的内容。" />
      <el-button type="danger" size="large" :loading="loading" @click="doReset">一键重置演示数据</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import { api } from '../../api';

const router = useRouter();
const loading = ref(false);

async function doReset() {
  // 双重确认，避免误触
  const r1 = await ElMessageBox.confirm(
    '确定要重置全部演示数据吗？此操作不可恢复。',
    '重置确认（1/2）',
    { type: 'error', confirmButtonText: '我知道后果，继续', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
  ).catch(() => null);
  if (!r1) return;
  const r2 = await ElMessageBox.prompt('请输入 RESET 以确认重置', '重置确认（2/2）', {
    confirmButtonText: '确认重置', cancelButtonText: '取消', inputPlaceholder: 'RESET',
    inputValidator: (v) => (v === 'RESET' ? true : '请输入 RESET'), confirmButtonClass: 'el-button--danger',
  }).catch(() => null);
  if (!r2) return;

  loading.value = true;
  try {
    const res = await api.post('/api/system/reset-demo', {});
    ElMessage.success(res.message);
    setTimeout(() => router.push('/dashboard'), 800);
  } finally { loading.value = false; }
}
</script>

<style scoped>
.reset-card { text-align: center; padding: 48px 20px; }
.reset-card h3 { margin: 14px 0 10px; }
.reset-card p { color: #64748b; font-size: 13.5px; line-height: 1.8; margin: 0 0 8px; }
</style>
