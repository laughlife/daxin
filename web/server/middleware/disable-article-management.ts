/** 公众号文章改由定时任务维护，旧后台文章写入/分类接口统一停用。 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const isArticleManagementApi = path === '/api/admin/articles'
    || path.startsWith('/api/admin/articles/')
    || path === '/api/admin/article-categories'

  if (!isArticleManagementApi) return

  setResponseStatus(event, 410)
  return {
    error: {
      code: 'ARTICLE_MANAGEMENT_REMOVED',
      message: '文章由公众号同步任务维护，后台文章管理已停用',
    },
  }
})
