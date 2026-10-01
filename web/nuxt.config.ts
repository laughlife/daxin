import { siteConfig } from './app/config/site'

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
      // 站点壳层阶段仅预渲染首页；导航中的规划路由（TRO 业务、国内业务等）
      // 尚未实现页面，关闭链接爬取避免预渲染 404，待业务页面落地后再开启。
      crawlLinks: false,
      routes: ['/']
    }
  }
})
