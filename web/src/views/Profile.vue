<template>
  <div class="page-container">
    <h1 class="page-title">我的资料</h1>
    <p class="page-sub">可自行维护联系方式与紧急联系人；部门、职位等信息请联系 HR 修改</p>

    <el-row :gutter="16" v-loading="loading">
      <el-col :xs="24" :md="8">
        <div class="hrm-card profile-card">
          <el-avatar :size="76" :style="{ background: info.avatarColor || '#4361ee', fontSize: 30 }">
            {{ info.name?.slice(0, 1) }}
          </el-avatar>
          <div class="profile-name">{{ info.name }}</div>
          <div class="profile-role">
            <el-tag type="info" effect="light" round>{{ roleLabel }}</el-tag>
          </div>
          <el-divider />
          <div class="profile-line"><el-icon><Postcard /></el-icon> 工号：{{ profile.emp_no || '—' }}</div>
          <div class="profile-line"><el-icon><Share /></el-icon> 部门：{{ profile.department_name || '—' }}</div>
          <div class="profile-line"><el-icon><User /></el-icon> 职位：{{ profile.position_name || '—' }}</div>
          <div class="profile-line"><el-icon><Calendar /></el-icon> 入职日期：{{ profile.hire_date || '—' }}</div>
          <el-divider />
          <el-button type="primary" plain style="width:100%" @click="$router.push('/attendance')">我的考勤</el-button>
          <el-button type="success" plain style="width:100%;margin-top:10px" @click="$router.push('/payroll')">我的工资条</el-button>
        </div>
      </el-col>

      <el-col :xs="24" :md="16">
        <div class="hrm-card">
          <h3 class="block-title">基本资料</h3>
          <el-form :model="form" label-width="104px" style="max-width:560px">
            <el-form-item label="姓名"><el-input :model-value="info.name" disabled /></el-form-item>
            <el-form-item label="性别">
              <el-input :model-value="dict(GENDER, profile.gender)" disabled />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="form.phone" placeholder="11 位手机号" maxlength="11" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="form.email" placeholder="name@example.com" />
            </el-form-item>
            <el-form-item label="紧急联系人">
              <el-input v-model="form.emergencyContact" />
            </el-form-item>
            <el-form-item label="紧急联系电话">
              <el-input v-model="form.emergencyPhone" maxlength="11" />
            </el-form-item>
            <el-form-item label="家庭住址">
              <el-input v-model="form.address" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
              <el-button @click="reset">还原</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api, authStore } from '../api';
import { GENDER, ROLE, dict } from '../utils/dict';

const loading = ref(false);
const saving = ref(false);
const info = ref({});
const profile = ref({});
const form = reactive({ phone: '', email: '', emergencyContact: '', emergencyPhone: '', address: '' });

const roleLabel = dict(ROLE, authStore.role);

async function load() {
  loading.value = true;
  try {
    const me = await api.get('/api/auth/me', { silent: true });
    info.value = me;
    profile.value = me.employee || {};
    reset();
  } finally { loading.value = false; }
}

function reset() {
  Object.assign(form, {
    phone: profile.value.phone || '',
    email: profile.value.email || '',
    emergencyContact: profile.value.emergency_contact || '',
    emergencyPhone: profile.value.emergency_phone || '',
    address: profile.value.address || '',
  });
}

async function save() {
  if (form.phone && !/^1\d{10}$/.test(form.phone)) return ElMessage.warning('手机号格式不正确');
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return ElMessage.warning('邮箱格式不正确');
  saving.value = true;
  try {
    await api.put('/api/employees/me/profile', { ...form });
    ElMessage.success('资料已更新');
    await load();
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.profile-card { text-align: center; }
.profile-name { font-size: 20px; font-weight: 700; margin-top: 12px; }
.profile-role { margin-top: 8px; }
.profile-line { display: flex; align-items: center; justify-content: center; gap: 8px; color: #475569; font-size: 13.5px; margin-bottom: 10px; }
.block-title { margin: 0 0 18px; font-size: 16px; }
</style>
