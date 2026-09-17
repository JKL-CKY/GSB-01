import { createRouter, createWebHashHistory } from 'vue-router';
import { authStore } from '../api';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '工作台', icon: 'Odometer' } },

      { path: 'org', name: 'org', component: () => import('../views/org/Index.vue'), meta: { title: '组织架构', icon: 'Share', roles: ['admin', 'hr'] } },
      { path: 'employees', name: 'employees', component: () => import('../views/employee/List.vue'), meta: { title: '员工管理', icon: 'User', roles: ['admin', 'hr'] } },

      { path: 'attendance', name: 'attendance', component: () => import('../views/attendance/List.vue'), meta: { title: '考勤记录', icon: 'Calendar' } },
      { path: 'leave', name: 'leave', component: () => import('../views/leave/List.vue'), meta: { title: '请假管理', icon: 'Tickets' } },
      { path: 'approvals', name: 'approvals', component: () => import('../views/approval/Center.vue'), meta: { title: '审批中心', icon: 'Stamp', roles: ['admin', 'hr'] } },

      { path: 'payroll', name: 'payroll', component: () => import('../views/payroll/List.vue'), meta: { title: '薪酬管理', icon: 'Wallet' } },
      { path: 'profile', name: 'profile', component: () => import('../views/Profile.vue'), meta: { title: '我的资料', icon: 'Postcard', hidden: true } },

      { path: 'system/users', name: 'system-users', component: () => import('../views/system/Users.vue'), meta: { title: '用户与角色', icon: 'Lock', roles: ['admin'] } },
      { path: 'system/audit', name: 'system-audit', component: () => import('../views/system/Audit.vue'), meta: { title: '审计日志', icon: 'Document', roles: ['admin'] } },
      { path: 'system/reset', name: 'system-reset', component: () => import('../views/system/Reset.vue'), meta: { title: '演示数据', icon: 'RefreshRight', roles: ['admin'] } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!authStore.token) { authStore.clear(); return { path: '/login', query: { redirect: to.fullPath } }; }
  if (to.meta.roles && !to.meta.roles.includes(authStore.role)) {
    return { path: '/dashboard' };
  }
  return true;
});

export default router;
