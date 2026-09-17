# 智汇 HRM · 本地人力资源管理平台

一个**真正前后端分离、本地运行、本地存数据**的人力资源管理系统。前端 Vue 3 + Vite + Element Plus，后端 Node.js + Express + SQLite，全项目仅使用 JavaScript，无 Redis / 消息队列 / 云服务等任何重依赖，图表仅使用 ECharts。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 登录与角色 | 管理员 / HR / 普通员工三种角色，菜单与数据范围按角色隔离，JWT 鉴权 |
| 工作台 | 在职人数、试用期、待办审批、近一年离职统计；ECharts 入离职趋势 + 部门人数饼图 |
| 组织架构 | 部门树（多级）、职位管理；删除前校验子部门 / 在职员工，有则拒绝并说明原因 |
| 员工管理 | 档案新增/编辑/调岗/离职，姓名/工号/部门/职位/状态搜索与排序、分页，CSV 批量导入（精确到行的错误提示）/ 导出（带 BOM） |
| 员工自助 | 维护本人联系方式与紧急联系人，查看本人考勤、本人工资条 |
| 考勤请假 | 请假申请（类型/起止/时长/事由），严格状态机 `草稿→待审批→通过/驳回（可撤销）`，通过后自动写考勤；考勤按人按月汇总 |
| 审批中心 | 转正审批（通过自动转正）、调薪审批（仅管理员可审批，通过自动更新基本工资） |
| 薪酬管理 | 月度工资单维护、一键按基本工资批量生成、CSV 导出；员工仅见本人工资条 |
| 系统管理（仅管理员） | 用户与角色管理、启停用、重置密码、操作审计日志查询、一键重置演示数据 |

安全红线：密码 **bcrypt 加盐哈希**存储；所有接口鉴权，员工访问管理端接口返回 **403**；身份证、薪资、银行账号按角色做**字段级权限**；全部 SQL **参数化**；删除 / 批量 / 权限变更 / 薪资修改均**二次确认 + 审计日志**，审计日志只追加、不可改。

## 环境要求

- **Node.js >= 18**（开发与验证使用 Node 20）
- npm（随 Node 自带）
- 无需安装数据库，SQLite 引擎通过 `better-sqlite3` 以本地文件方式运行

## 快速开始（克隆到新机器照做即可）

需要打开**两个终端**，分别启动后端与前端：

```bash
# 1) 安装两个子项目的依赖
npm run install:all

# 2) 初始化数据库并灌入演示数据（首次必须执行；服务首次启动也会自动初始化）
npm run initdb

# 终端 A：启动后端（默认端口 3000）
npm run dev:server

# 终端 B：启动前端开发服务器（默认端口 5173）
npm run dev:web
```

浏览器打开 **http://localhost:5173** 即可。

也可以进入子目录单独操作：

```bash
cd server && npm install && npm run dev      # 后端：http://localhost:3000/api
cd web    && npm install && npm run dev       # 前端：http://localhost:5173
```

## 演示账号（开箱即用）

| 角色 | 用户名 | 密码 | 能看到什么 |
| --- | --- | --- | --- |
| 系统管理员 | `admin` | `Admin@123` | 全部功能，含用户管理、审计日志、重置数据、调薪审批 |
| HR | `hr` | `Hr@123` | 组织、员工、考勤、请假/转正审批、薪酬（不可审批调薪、无系统管理） |
| 普通员工 | `zhangwei` | `Emp@123` | 我的资料、我的考勤、我的请假、我的工资条 |

## 端口与前后端联调方式

- 后端监听 `http://localhost:3000`，只提供 `/api/*` RESTful 接口。
- 前端开发服务器 `http://localhost:5173`，通过 **Vite proxy** 把 `/api` 请求转发到后端（见 `web/vite.config.js`），代码中**没有写死后端地址，也不依赖 CORS 插件**。
- 端口冲突时可改：后端 `PORT=3100 npm start`（server 目录），同时把 `web/vite.config.js` 代理 target 改为对应端口。

## 数据存在哪、会不会丢

- 数据库就是**单个 SQLite 文件**：`server/data/hrm.db`（首次启动自动创建，已被 .gitignore 忽略）。
- 服务重启数据保留；删除该文件或执行重置即可重新开始。
- 手动初始化 / 重置：
  - `npm run initdb` —— 建表，空库时灌入演示数据
  - `npm run initdb:force` —— 清空并重新灌入演示数据
  - 系统内：管理员登录后「系统管理 → 演示数据 → 一键重置」（需输入 RESET 二次确认）

## 异常场景的表现

- **后端没启动 / 断网**：前端请求会在超时或连接失败时提示「无法连接到服务器，请确认后端服务（localhost:3000）已启动」，列表提供「重试」，不会无限转圈或白屏。
- **接口报错**：后端统一返回 `{ code, message, detail }`，前端用 Element Plus 消息条友好提示；500 不会把堆栈裸给用户。
- **权限越界**：员工访问管理端接口返回 403，前端菜单中也不会出现无权功能。

## 目录结构

```
.
├── server/                 # 后端独立子项目（Express + SQLite）
│   ├── package.json
│   ├── data/hrm.db         # 运行后自动生成的数据库文件
│   └── src/
│       ├── index.js        # 入口：路由装配、首次启动自动建表灌数据
│       ├── config.js / db.js / schema.sql / seed.js / initdb.js
│       ├── auth.js         # JWT、登录校验、角色中间件
│       ├── audit.js        # 审计日志写入
│       ├── errors.js       # 统一错误模型与错误处理
│       ├── utils/          # 分页排序白名单、CSV（含 BOM）
│       └── routes/         # auth/dashboard/departments/positions/employees/
│                           # attendance/leave/payrolls/approvals/system
└── web/                    # 前端独立子项目（Vue 3 + Vite + Element Plus + ECharts）
    ├── package.json
    ├── vite.config.js      # /api 代理到 localhost:3000
    └── src/
        ├── api/            # fetch 封装：JWT、统一错误、401、下载
        ├── router/         # 路由与角色守卫
        ├── layouts/        # 侧边菜单 + 顶栏（待办提醒、用户菜单）
        ├── views/          # 登录、工作台、组织、员工、考勤、请假、审批、薪酬、系统管理
        ├── composables/    # 部门/职位选项缓存
        └── utils/          # 枚举字典与格式化（中文、彩色 Tag、脱敏）
```

## 主要 API（节选）

- `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/change-password`
- `GET /api/dashboard`
- `GET/POST/PUT/DELETE /api/departments` · `/api/positions`
- `GET/POST/PUT /api/employees` · `GET /api/employees/export` · `POST /api/employees/import` · `POST /api/employees/:id/resign|transfer` · `PUT /api/employees/me/profile`
- `GET /api/attendance` · `GET /api/attendance/export`
- `GET/POST/PUT /api/leave-requests` · `POST /:id/submit|approve|cancel`
- `GET/POST /api/approvals/regular` · `POST /api/approvals/regular/:id/approve`
- `GET/POST /api/approvals/adjustment` · `POST /api/approvals/adjustment/:id/approve`
- `GET/POST/PUT /api/payrolls` · `POST /api/payrolls/batch-generate` · `GET /api/payrolls/export/csv`
- 管理员：`/api/system/users/*` · `GET /api/system/audit-logs` · `POST /api/system/reset-demo`

> 说明：本项目为本地演示用途，JWT 密钥默认写在 `server/src/config.js`，生产部署请通过环境变量 `JWT_SECRET`、`PORT`、`DB_PATH` 覆盖。
