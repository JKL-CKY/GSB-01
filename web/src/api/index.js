/**
 * 统一 API 封装：
 * - 自动携带 JWT
 * - 统一错误格式 { code, message, detail }
 * - 401 自动清理登录态并跳回登录页
 * - 网络不通 / 后端未启动给出明确提示（不无限转圈）
 */
import { ElMessage } from 'element-plus';

const TOKEN_KEY = 'hrm_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// 全局登录态（轻量响应式，无需 pinia）
import { reactive } from 'vue';

export const authStore = reactive({
  token: getToken(),
  user: JSON.parse(localStorage.getItem('hrm_user') || 'null'),
  setSession(token, user) {
    this.token = token;
    this.user = user;
    setToken(token);
    localStorage.setItem('hrm_user', JSON.stringify(user));
  },
  clear() {
    this.token = '';
    this.user = null;
    clearToken();
    localStorage.removeItem('hrm_user');
  },
  get role() {
    return this.user?.role || '';
  },
  get isManager() {
    return this.role === 'admin' || this.role === 'hr';
  },
});

async function request(method, url, body, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 20000);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(opts.headers || {}),
      },
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e.name === 'AbortError'
      ? '请求超时，请检查网络或稍后重试'
      : '无法连接到服务器，请确认后端服务（localhost:3000）已启动';
    if (opts.silent) throw new Error(msg);
    ElMessage.error(msg);
    throw new Error(msg);
  }
  clearTimeout(timer);

  // 文件下载
  if (opts.raw) return res;

  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

  if (!res.ok) {
    const message = data?.message || `请求失败（${res.status}）`;
    if (res.status === 401) {
      authStore.clear();
      if (!opts.silent && location.hash !== '#/login') {
        ElMessage.warning(message);
        location.hash = '#/login';
      }
    } else if (!opts.silent) {
      ElMessage({ type: res.status >= 500 ? 'error' : 'warning', message, duration: 3500 });
    }
    const err = new Error(message);
    err.status = res.status;
    err.code = data?.code;
    err.detail = data?.detail;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (url, opts) => request('GET', url, null, opts),
  post: (url, body, opts) => request('POST', url, body, opts),
  put: (url, body, opts) => request('PUT', url, body, opts),
  del: (url, opts) => request('DELETE', url, null, opts),
  // 下载文件（带鉴权头）
  async download(url, fallbackName) {
    const res = await request('GET', url, null, { raw: true });
    if (!res.ok) {
      const t = await res.text();
      let msg = `下载失败（${res.status}）`;
      try { msg = JSON.parse(t).message || msg; } catch { /* ignore */ }
      ElMessage.error(msg);
      throw new Error(msg);
    }
    const blob = await res.blob();
    const nameMatch = /filename="?([^"]+)"?/.exec(res.headers.get('Content-Disposition') || '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nameMatch ? nameMatch[1] : fallbackName;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  // 把查询对象拼到 URL（跳过空值）
  qs(params = {}) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') sp.append(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
  },
};
