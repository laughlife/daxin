import { siteConfig } from './app/config/site'

// 注意：这里刻意不 import 任何 data/mock 或数据仓库。
// 页面已改为由 Nitro API 读取数据库，构建期不应再依赖 mock 数据推导路由，
// 否则 npm run build / generate 会去预渲染 mock 里的示例案件（其中包含明确标注的演示数据），
// 与「前台不展示演示数据」的要求冲突。
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // 开发服务端口固定为 3002（本项目约定），可用 PORT 环境变量覆盖。
  devServer: {
    port: 3002
  },

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
      // 只预渲染不依赖数据库的固定页面。
      // 详情页（案件、文章、品牌、律所）数据量上千且来自数据库，
      // 由 SSR/ISR 按需渲染，不进入预渲染清单；开启链接爬取会试图抓取全部详情页。
      crawlLinks: false,
      routes: [
        '/privacy',
        '/disclaimer',
        '/infringement-check'
      ]
    }
  }
})
