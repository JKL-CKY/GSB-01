<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '226px'" class="sidebar" :class="{ collapsed }">
      <div class="logo">
        <el-icon :size="22" color="#fff"><OfficeBuilding /></el-icon>
        <span v-show="!collapsed" class="logo-text">智汇 HRM</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        class="side-menu"
        background-color="transparent"
        text-color="#c6d2f5"
        active-text-color="#ffffff"
      >
        <template v-for="item in menus" :key="item.path">
          <el-menu-item :index="'#' + item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
          <el-divider v-if="item.groupAfter" class="menu-divider" />
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div class="top-left">
          <el-icon class="collapse-btn" :size="20" @click="toggleCollapse">
            <Fold v-if="!collapsed" /><Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="top-right">
          <el-popover placement="bottom-end" :width="380" trigger="click" @show="loadTodo">
            <template #reference>
              <el-badge :value="todoCount" :hidden="todoCount === 0" :max="99" class="bell-badge">
                <el-icon :size="20" class="bell-icon"><Bell /></el-icon>
              </el-badge>
            </template>
            <div class="todo-pop">
              <div class="todo-head">
                <span>待办提醒</span>
                <el-tag v-if="authStore.isManager" size="small" type="warning">{{ todoCount }} 项待处理</el-tag>
              </div>
              <div v-if="todoLoading" class="todo-empty"><el-icon class="is-loading"><Loading /></el-icon> 加载中…</div>
              <template v-else>
                <div v-for="t in todoItems" :key="t.key" class="todo-row" @click="goTodo(t)">
                  <el-tag :type="t.type" size="small" effect="light">{{ t.label }}</el-tag>
                  <span class="todo-text">{{ t.text }}</span>
                  <el-icon class="todo-arrow"><ArrowRight /></el-icon>
                </div>
                <div v-if="!todoItems.length" class="todo-empty">
                  <el-icon :size="28" color="#c0c4cc"><CircleCheck /></el-icon>
                  <span>暂无待办，一切井井有条</span>
                </div>
              </template>
            </div>
          </el-popover>

          <el-dropdown trigger="click" @command="onUserCmd">
            <div class="user-chip">
              <el-avatar :size="32" :style="{ background: authStore.user?.avatarColor || '#4361ee' }">
                {{ (authStore.user?.name || 'U').slice(0, 1) }}
              </el-avatar>
              <span class="user-meta">
                <span class="user-name">{{ authStore.user?.name }}</span>
                <el-tag size="small" :type="roleTag" effect="dark" round>{{ roleLabel }}</el-tag>
              </span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile"><el-icon><Postcard /></el-icon>我的资料</el-dropdown-item>
                <el-dropdown-item command="password"><el-icon><Key /></el-icon>修改密码</el-dropdown-item>
                <el-dropdown-item v-if="role==='admin'" command="reset" divided><el-icon><RefreshRight /></el-icon>重置演示数据</el-dropdown-item>
                <el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <!-- 修改密码弹窗 -->
    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form :model="pwdForm" label-width="92px">
        <el-form-item label="旧密码"><el-input v-model="pwdForm.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 8 位" /></el-form-item>
        <el-form-item label="确认新密码"><el-input v-model="pwdForm.confirm" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitPwd">确认修改</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, authStore } from '../api';
import { ROLE, dict, dictType, LEAVE_TYPE } from '../utils/dict';

const route = useRoute();
const router = useRouter();
const collapsed = ref(window.innerWidth < 1100);
const userToggled = ref(false);

const ALL_MENUS = [
  { path: '/dashboard', title: '工作台', icon: 'Odometer' },
  { path: '/org', title: '组织架构', icon: 'Share', roles: ['admin', 'hr'] },
  { path: '/employees', title: '员工管理', icon: 'User', roles: ['admin', 'hr'] },
  { path: '/attendance', title: '考勤记录', icon: 'Calendar' },
  { path: '/leave', title: '请假管理', icon: 'Tickets' },
  { path: '/approvals', title: '审批中心', icon: 'Stamp', roles: ['admin', 'hr'], groupAfter: true },
  { path: '/payroll', title: '薪酬管理', icon: 'Wallet' },
  { path: '/system/users', title: '用户与角色', icon: 'Lock', roles: ['admin'] },
  { path: '/system/audit', title: '审计日志', icon: 'Document', roles: ['admin'] },
  { path: '/system/reset', title: '演示数据', icon: 'RefreshRight', roles: ['admin'] },
];

const role = computed(() => authStore.role);
const menus = computed(() => ALL_MENUS.filter((m) => !m.roles || m.roles.includes(role.value)));
const activeMenu = computed(() => '#' + route.path);
const currentTitle = computed(() => route.meta.title || '工作台');
const roleLabel = computed(() => dict(ROLE, role.value));
const roleTag = computed(() => dictType(ROLE, role.value));

/* ---------- 待办 ---------- */
const todoCount = ref(0);
const todoItems = ref([]);
const todoLoading = ref(false);
let dashCache = null;

async function refreshTodoBadge() {
  try {
    const d = await api.get('/api/dashboard', { silent: true });
    dashCache = d;
    todoCount.value = authStore.isManager
      ? (d.pending.leave + d.pending.regular + d.pending.adjustment)
      : 0;
  } catch { /* 顶栏静默 */ }
}

async function loadTodo() {
  if (!authStore.isManager) return;
  todoLoading.value = true;
  try {
    if (!dashCache) await refreshTodoBadge();
    const d = dashCache;
    const items = [];
    if (d.pending.leave) items.push({ key: 'leave', label: '请假审批', type: 'warning', text: `${d.pending.leave} 份请假申请待审批`, path: '/leave' });
    if (d.pending.regular) items.push({ key: 'regular', label: '转正审批', type: 'primary', text: `${d.pending.regular} 份转正申请待审批`, path: '/approvals' });
    if (d.pending.adjustment) items.push({ key: 'adjust', label: '调薪审批', type: 'danger', text: `${d.pending.adjustment} 份调薪申请待审批`, path: '/approvals' });
    for (const t of d.todoLeave || []) {
      items.push({
        key: 'leave-' + t.id, label: '请假', type: 'warning',
        text: `${t.name} 申请${dict(LEAVE_TYPE, t.leave_type)} ${t.duration} 天`,
        path: '/leave',
      });
    }
    todoItems.value = items.slice(0, 8);
  } finally {
    todoLoading.value = false;
  }
}

function goTodo(t) {
  router.push(t.path);
}

/* ---------- 用户菜单 ---------- */
const pwdVisible = ref(false);
const pwdLoading = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });

function onUserCmd(cmd) {
  if (cmd === 'profile') router.push('/profile');
  else if (cmd === 'password') { pwdVisible.value = true; }
  else if (cmd === 'reset') router.push('/system/reset');
  else if (cmd === 'logout') doLogout();
}

async function submitPwd() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) return ElMessage.warning('请填写完整');
  if (pwdForm.newPassword.length < 8) return ElMessage.warning('新密码至少 8 位');
  if (pwdForm.newPassword !== pwdForm.confirm) return ElMessage.warning('两次输入的新密码不一致');
  pwdLoading.value = true;
  try {
    await api.post('/api/auth/change-password', { oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
    ElMessage.success('密码修改成功，下次登录请使用新密码');
    pwdVisible.value = false;
    Object.assign(pwdForm, { oldPassword: '', newPassword: '', confirm: '' });
  } finally { pwdLoading.value = false; }
}

async function doLogout() {
  await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', { type: 'warning', confirmButtonText: '退出', cancelButtonText: '取消' });
  authStore.clear();
  router.replace('/login');
}

function toggleCollapse() {
  userToggled.value = true;
  collapsed.value = !collapsed.value;
}

function onResize() {
  if (window.innerWidth < 1100 && !collapsed.value) collapsed.value = true;
  else if (window.innerWidth >= 1280 && collapsed.value && !userToggled.value) collapsed.value = false;
}
onMounted(() => {
  refreshTodoBadge();
  window.addEventListener('resize', onResize);
  window.__hrmRefreshTodo = refreshTodoBadge;
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  delete window.__hrmRefreshTodo;
});
</script>

<style scoped>
.layout { height: 100vh; }
.sidebar {
  background: linear-gradient(180deg, #1e2555 0%, #2b3680 100%);
  transition: width .22s ease;
  overflow-x: hidden;
  box-shadow: 2px 0 12px rgba(20, 30, 80, .18);
  z-index: 5;
}
.logo {
  height: 60px; display: flex; align-items: center; gap: 10px;
  padding: 0 20px; color: #fff; font-weight: 700; font-size: 18px;
  letter-spacing: 1px; white-space: nowrap;
}
.side-menu { border-right: none; }
.side-menu :deep(.el-menu-item) {
  margin: 4px 10px; border-radius: 9px; height: 46px;
}
.side-menu :deep(.el-menu-item:hover) { background: rgba(255, 255, 255, .08) !important; }
.side-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, #4361ee, #5b7bf0) !important;
  box-shadow: 0 4px 12px rgba(67, 97, 238, .45);
}
.menu-divider { border-color: rgba(255,255,255,.12); margin: 8px 16px; }
:deep(.el-menu--collapse .menu-divider) { margin: 8px 4px; }

.topbar {
  height: 60px; background: #fff; display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 1px 6px rgba(30, 41, 90, .06);
  padding: 0 22px; z-index: 4;
}
.top-left { display: flex; align-items: center; gap: 14px; }
.collapse-btn { cursor: pointer; color: #5b6b8c; }
.collapse-btn:hover { color: var(--hrm-primary); }
.top-right { display: flex; align-items: center; gap: 22px; }
.bell-icon { cursor: pointer; color: #5b6b8c; }
.bell-icon:hover { color: var(--hrm-primary); }

.user-chip { display: flex; align-items: center; gap: 9px; cursor: pointer; outline: none; }
.user-meta { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25; }
.user-name { font-size: 13.5px; font-weight: 600; color: #1e293b; }
@media (max-width: 640px) { .user-meta { display: none; } }

.main { background: var(--hrm-bg); padding: 20px 22px; overflow-y: auto; }

.fade-enter-active, .fade-leave-active { transition: opacity .18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.todo-pop { max-height: 420px; overflow-y: auto; }
.todo-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 10px; }
.todo-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 8px;
  border-radius: 8px; cursor: pointer;
}
.todo-row:hover { background: #f4f7ff; }
.todo-text { flex: 1; font-size: 13px; color: #475569; }
.todo-arrow { color: #c0c4cc; }
.todo-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 0; color: #94a3b8; font-size: 13px; }
</style>
