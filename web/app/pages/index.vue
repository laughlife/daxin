<script setup lang="ts">
/**
 * 站点壳层预览页（非正式首页）
 * 仅用于验证 Task 2 建立的全局布局、设计令牌与基础组件，
 * 正式首页与业务页面在后续任务中开发。
 */
useSeoMeta({
  title: '站点壳层预览',
  description:
    '大信法务官网 Task 2 站点壳层与设计系统预览页，非正式首页，文案与联系方式均为占位符。'
})

const colorSwatches = [
  { name: '品牌主色', variable: '--color-primary' },
  { name: '深色背景', variable: '--color-bg-dark' },
  { name: '浅色背景', variable: '--color-bg-light' },
  { name: '正文颜色', variable: '--color-text' },
  { name: '次要文字', variable: '--color-text-muted' },
  { name: '边框颜色', variable: '--color-border' },
  { name: '成功', variable: '--color-success' },
  { name: '警告', variable: '--color-warning' },
  { name: '错误', variable: '--color-error' }
]
</script>

<template>
  <div>
    <section class="preview-hero">
      <PageContainer size="narrow">
        <p class="preview-hero__badge">Task 2 · 站点壳层预览</p>
        <SectionHeading
          :level="1"
          align="center"
          title="官网基础框架预览"
          description="本页面不是正式首页，仅用于验证全局布局与设计系统：顶部公告栏、Header、桌面 / 移动端导航、Footer，以及按钮、卡片等基础组件。正式首页与各业务页面将在后续任务中开发，品牌信息均为占位符。"
        />
        <div class="preview-hero__actions">
          <BaseButton variant="primary" size="lg">主按钮示例</BaseButton>
          <BaseButton variant="secondary" size="lg">次按钮示例</BaseButton>
        </div>
      </PageContainer>
    </section>

    <section class="preview-section">
      <PageContainer>
        <SectionHeading
          title="基础组件示例"
          description="以下卡片使用 BaseCard 组件，标题使用 SectionHeading 组件，间距与颜色均来自设计令牌。"
        />
        <div class="preview-cards">
          <BaseCard title="设计令牌">
            颜色、间距、圆角、阴影与字体层级统一在 tokens.css 中以 CSS Variables
            定义，组件内不散落硬编码色值。
          </BaseCard>
          <BaseCard title="全局布局">
            公告栏、Header、主内容区与 Footer 通过默认布局组合；桌面导航支持键盘操作，
            移动端抽屉支持遮罩、Escape 关闭与滚动锁定。
          </BaseCard>
          <BaseCard title="占位说明">
            Logo、微信号、电话、邮箱、地址与 ICP 备案号均为 TODO
            占位符，尚未写入任何未经确认的正式品牌信息。
          </BaseCard>
        </div>
      </PageContainer>
    </section>

    <section class="preview-section preview-section--alt">
      <PageContainer>
        <SectionHeading
          title="色彩令牌示例"
          description="下列色块直接引用 tokens.css 中的 CSS Variables，用于验证设计令牌在页面中生效。"
        />
        <ul class="preview-swatches">
          <li v-for="swatch in colorSwatches" :key="swatch.variable" class="preview-swatch">
            <span
              class="preview-swatch__color"
              :style="{ backgroundColor: `var(${swatch.variable})` }"
            />
            <span class="preview-swatch__name">{{ swatch.name }}</span>
            <code class="preview-swatch__variable">{{ swatch.variable }}</code>
          </li>
        </ul>
      </PageContainer>
    </section>
  </div>
</template>

<style scoped>
.preview-hero {
  padding-block: var(--space-16) var(--space-12);
  background-color: var(--color-bg-light);
  text-align: center;
}

.preview-hero__badge {
  display: inline-block;
  margin-bottom: var(--space-4);
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.preview-hero__actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-8);
}

.preview-section {
  padding-block: var(--space-12);
}

.preview-section--alt {
  background-color: var(--color-bg-light);
}

.preview-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-6);
  margin-top: var(--space-8);
}

.preview-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-8);
}

.preview-swatch {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.preview-swatch__color {
  height: 48px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.preview-swatch__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.preview-swatch__variable {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

@media (max-width: 1023px) {
  .preview-cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 639px) {
  .preview-hero {
    padding-block: var(--space-10) var(--space-8);
  }

  .preview-hero__actions :deep(.btn) {
    width: 100%;
  }
}
</style>
