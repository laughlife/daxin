// 公开接口的统一错误处理：
//   - 出错时返回 { error: { code, message } } 并设置 HTTP 状态码；
//   - 消息为可直接展示的中文，绝不回退到 Mock 数据；
//   - 服务端日志保留原始异常，便于排查。
import type { H3Event } from 'h3'

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

/** 构造并写入错误响应体（含状态码）。 */
export function publicApiError(event: H3Event, status: number, code: string, message: string): ApiErrorBody {
  setResponseStatus(event, status)
  return { error: { code, message } }
}

/** 包装数据库读取：失败时记录日志并返回中文 500 响应，不抛出原始异常。 */
export async function withPublicApi<T>(
  event: H3Event,
  failureMessage: string,
  work: () => Promise<T>,
): Promise<T | ApiErrorBody> {
  try {
    return await work()
  } catch (error) {
    console.error('[public-api] 数据读取失败', error)
    return publicApiError(event, 500, 'INTERNAL_ERROR', failureMessage)
  }
}
