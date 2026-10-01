import { siteConfig } from './app/config/site'
import { mockCases } from './app/data/mock/cases'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // 全局基础样式（内部通过 @import 引入设计令牌 tokens.css）
  css: ['~/assets/styles/main.css'],

  // 组件按文件名自动导入（layout/ 与 ui/ 子目录不加路径前缀）
  components: [
    { path: '~/components', pathPrefix: false }
  ],

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: siteConfig.description }
      ]
    }
  },

  nitro: {
    prerender: {
      // 站点壳层阶段仅预渲染已实现页面；其余规划路由（TRO 资讯、常见问题等）
      // 尚未实现，关闭链接爬取避免预渲染 404，待业务页面落地后再开启。
      crawlLinks: false,
      routes: [
        '/',
        '/tro/cases',
        // Mock 案件详情页（静态可访问；接入真实数据后改为 SSR/ISR 并更新此处）
        ...mockCases.map(item => `/tro/cases/${item.slug}`)
      ]
    }
  }
})
