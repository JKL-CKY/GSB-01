/**
 * 统一业务异常：所有可预期的接口错误都抛 ApiError，
 * 由 errorHandler 中间件转成统一格式 { code, message, detail }
 */
class ApiError extends Error {
  constructor(status, message, code, detail) {
    super(message);
    this.status = status;
    this.code = code || 'BUSINESS_ERROR';
    this.detail = detail;
  }
}

const badRequest = (msg, detail) => new ApiError(400, msg, 'BAD_REQUEST', detail);
const unauthorized = (msg = '未登录或登录状态已失效') => new ApiError(401, msg, 'UNAUTHORIZED');
const forbidden = (msg = '没有权限执行该操作') => new ApiError(403, msg, 'FORBIDDEN');
const notFound = (msg = '资源不存在') => new ApiError(404, msg, 'NOT_FOUND');
const conflict = (msg, detail) => new ApiError(409, msg, 'CONFLICT', detail);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      detail: err.detail || undefined,
    });
  }
  // 兜底：不把堆栈 / SQL 错误裸给前端
  console.error('[unhandled error]', err);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: '服务器开小差了，请稍后重试或联系管理员',
  });
}

module.exports = { ApiError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler, errorHandler };
