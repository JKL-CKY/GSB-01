<template>
  <div class="login-page">
    <div class="bg-decor decor-1"></div>
    <div class="bg-decor decor-2"></div>
    <div class="bg-decor decor-3"></div>

    <div class="login-card">
      <div class="brand-side">
        <div class="brand-logo">
          <el-icon :size="26"><OfficeBuilding /></el-icon>
          <span>智汇 HRM</span>
        </div>
        <h2>让人力资源管理<br />更简单、更专业</h2>
        <p>组织人事 · 考勤请假 · 薪酬审批 一站式平台</p>
        <ul class="brand-points">
          <li><el-icon><Check /></el-icon> 角色分权，敏感数据字段级管控</li>
          <li><el-icon><Check /></el-icon> 审批状态机，关键操作全程留痕</li>
          <li><el-icon><Check /></el-icon> 本地部署，数据就在你自己电脑上</li>
        </ul>
      </div>

      <div class="form-side">
        <h3>欢迎登录</h3>
        <p class="form-tip">请使用分配给你的演示账号登录</p>
        <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="onLogin">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" size="large" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码" :prefix-icon="Lock"
              size="large" show-password @keyup.enter="onLogin" />
          </el-form-item>
          <el-button type="primary" class="login-btn" size="large" :loading="loading" @click="onLogin">
            登 录
          </el-button>
        </el-form>

        <el-divider>演示账号（点击快速填充）</el-divider>
        <div class="demo-accounts">
          <div class="demo-item" v-for="a in accounts" :key="a.username" @click="fill(a)">
            <el-tag :type="a.tag" effect="light" round>{{ a.label }}</el-tag>
            <span class="demo-user">{{ a.username }}</span>
            <span class="demo-pwd">{{ a.password }}</span>
          </div>
        </div>
      </div>
    </div>
    <p class="login-footer">本地前后端分离演示项目 · Vue 3 + Express + SQLite</p>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { api, authStore } from '../api';

const router = useRouter();
const route = useRoute();
const formRef = ref();
const loading = ref(false);
const form = reactive({ username: '', password: '' });
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const accounts = [
  { label: '管理员', tag: 'danger', username: 'admin', password: 'Admin@123' },
  { label: 'HR', tag: 'primary', username: 'hr', password: 'Hr@123' },
  { label: '员工', tag: 'info', username: 'zhangwei', password: 'Emp@123' },
];

function fill(a) {
  form.username = a.username;
  form.password = a.password;
}

async function onLogin() {
  await formRef.value.validate().catch(() => { throw new Error('validate'); });
  loading.value = true;
  try {
    const data = await api.post('/api/auth/login', { username: form.username.trim(), password: form.password }, { silent: true });
    authStore.setSession(data.token, data.user);
    ElMessage.success(`欢迎回来，${data.user.name}`);
    router.replace(route.query.redirect || '/dashboard');
  } catch (e) {
    ElMessage.error(e.message || '登录失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #1e2a78 0%, #4361ee 55%, #5b8def 100%);
  padding: 24px;
}
.bg-decor { position: absolute; border-radius: 50%; filter: blur(2px); opacity: .35; }
.decor-1 { width: 420px; height: 420px; background: radial-gradient(circle, #8ea7ff, transparent 70%); top: -120px; left: -100px; }
.decor-2 { width: 360px; height: 360px; background: radial-gradient(circle, #67e8f9, transparent 70%); bottom: -120px; right: -80px; opacity: .25; }
.decor-3 { width: 200px; height: 200px; background: radial-gradient(circle, #c7d2fe, transparent 70%); top: 40%; right: 12%; opacity: .3; }

.login-card {
  position: relative;
  z-index: 1;
  width: 880px;
  max-width: 100%;
  min-height: 480px;
  background: rgba(255, 255, 255, .98);
  border-radius: 20px;
  box-shadow: 0 30px 80px rgba(15, 23, 42, .35);
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
}
.brand-side {
  background: linear-gradient(150deg, #312e81, #4361ee 70%, #5b8def);
  color: #fff;
  padding: 44px 38px;
  display: flex;
  flex-direction: column;
}
.brand-logo { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; }
.brand-side h2 { font-size: 26px; line-height: 1.45; margin: 48px 0 12px; }
.brand-side > p { opacity: .85; font-size: 13px; margin: 0 0 28px; }
.brand-points { list-style: none; padding: 0; margin: 0; font-size: 13px; opacity: .92; }
.brand-points li { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.brand-points .el-icon { background: rgba(255,255,255,.2); border-radius: 50%; padding: 2px; }

.form-side { padding: 48px 44px; display: flex; flex-direction: column; justify-content: center; }
.form-side h3 { font-size: 24px; margin: 0 0 6px; color: #1e293b; }
.form-tip { color: #94a3b8; font-size: 13px; margin: 0 0 26px; }
.login-btn { width: 100%; font-size: 16px; letter-spacing: 6px; border-radius: 10px; }

.demo-accounts { display: flex; flex-direction: column; gap: 8px; }
.demo-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 12px; border: 1px dashed #dbe3f0; border-radius: 10px;
  cursor: pointer; transition: all .2s; font-size: 13px;
}
.demo-item:hover { border-color: var(--hrm-primary); background: #f5f8ff; }
.demo-user { font-weight: 600; color: #334155; min-width: 84px; }
.demo-pwd { color: #94a3b8; font-family: monospace; }
.login-footer { position: relative; z-index: 1; color: rgba(255,255,255,.8); font-size: 12px; margin-top: 22px; }

@media (max-width: 760px) {
  .login-card { grid-template-columns: 1fr; width: 440px; }
  .brand-side { display: none; }
  .form-side { padding: 36px 28px; }
}
</style>
