<script setup lang="ts">
const props = defineProps<{ kind: 'privacy' | 'disclaimer' }>()
const title = computed(() => props.kind === 'privacy' ? '隐私说明' : '免责声明')
useSeoMeta({ title: () => title.value, description: '本页说明本站的数据处理方式与相关声明。' })
</script>
<template><div class="legal-page"><PageContainer><ContentColumns><article class="legal-page__body"><h1>{{ title }}</h1><p class="legal-page__notice">本页说明本站当前的数据处理方式与相关声明。</p><template v-if="kind === 'privacy'"><h2>表单与信息处理</h2><p>产品侵权检测表单仅在浏览器内完成校验并给出提交反馈，不发送到后台，也不保存填写内容。案件及文章查询的筛选条件可能体现在浏览器地址栏。</p><h2>联系渠道</h2><p>点击微信号复制到本机剪贴板，扫码会打开微信对应账号。向团队提供材料前，请在相应联系渠道确认所需信息及处理方式。</p></template><template v-else><h2>资料说明</h2><p>页面展示的案件、品牌、律所、文章与活动信息来源于公开渠道整理，仅用于介绍服务与展示流程。</p><h2>具体法律事项</h2><p>页面用于介绍服务及展示流程；具体案件需要结合完整资料与实际情况沟通。页面内容不替代对具体事项的专业评估。</p></template><NuxtLink to="/about">查看团队介绍与联系方式 →</NuxtLink></article></ContentColumns></PageContainer></div></template>
<style scoped>
.legal-page { padding-block:var(--space-section-compact) var(--space-section); background:var(--color-bg-light); }
.legal-page__body { padding:var(--space-8); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
h1 { font-size:var(--heading-1); }
h2 { margin-top:var(--space-6); font-size:var(--text-xl); }
p { margin:var(--space-4) 0; color:var(--color-text-muted); line-height:var(--leading-relaxed); }
.legal-page__notice { padding:var(--space-4); border-left:3px solid var(--color-primary); border-radius:0 var(--radius-md) var(--radius-md) 0; background:var(--color-bg-light); }
@media(max-width:639px) { .legal-page__body { padding:var(--space-5); } }
</style>
