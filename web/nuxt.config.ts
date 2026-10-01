// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // 全局基础样式（内部通过 @import 引入设计令牌 tokens.css）
  css: ['~/assets/styles/main.css'],

  // 组件按文件名自动导入（layout/ 与 ui/ 子目录不加路径前缀）
  components: [
    { path: '~/components', pathPrefix: false }
  ]
})
