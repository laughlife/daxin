<script setup lang="ts">
import { computed } from 'vue'

/**
 * 统一搜索框（胶囊样式）。
 *
 * 需求（2026-10-20）：去掉旧的蓝色方框搜索区，TRO 业务 / 国内业务 / 常见问题
 * 三处搜索框统一成「左放大镜 + 输入 + 右侧金色搜索按钮」的胶囊样式。
 *
 * 为什么抽成组件：三处各写一套必然出现间距、圆角、按钮配色不一致，
 * 而这正是需求要消除的问题。
 *
 * 输入仍通过 v-model 双向绑定（父组件保持原有的即时筛选行为，不改变交互节奏），
 * 提交按钮额外 emit submit，用于移动端收起键盘与明确触发。
 */
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  label?: string
  buttonLabel?: string
  /** 关联的筛选说明，供读屏使用 */
  describeBy?: string
  disabled?: boolean
}>(), {
  placeholder: '输入关键词',
  label: '关键词',
  buttonLabel: '搜索',
  describeBy: undefined,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [value: string]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (next: string) => emit('update:modelValue', next),
})

function onSubmit() {
  emit('submit', props.modelValue)
}
</script>

<template>
  <form class="search-pill" role="search" @submit.prevent="onSubmit">
    <label class="search-pill__label" for="search-pill-input">{{ label }}</label>
    <div class="search-pill__control">
      <svg class="search-pill__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </svg>
      <input
        id="search-pill-input"
        v-model="value"
        class="search-pill__input"
        type="search"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-describedby="describeBy"
        autocomplete="off"
      >
      <button class="search-pill__submit" type="submit" :disabled="disabled">
        {{ buttonLabel }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.search-pill {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

/* 视觉上隐藏标签，但保留给读屏与键盘用户 */
.search-pill__label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.search-pill__control {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  height: 52px;
  padding-left: var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-bg-page);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}

.search-pill__control:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent);
}

.search-pill__icon {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--color-text-muted);
  stroke-width: 1.8;
  stroke-linecap: round;
}

.search-pill__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
}

.search-pill__input::placeholder { color: var(--color-text-muted); }

/* 搜索按钮：贴在胶囊右端，与外层圆角对齐 */
.search-pill__submit {
  flex: 0 0 auto;
  height: calc(100% - 8px);
  margin-right: 4px;
  padding: 0 var(--space-6);
  border: 0;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--transition-base);
}

.search-pill__submit:hover:not(:disabled) { background: var(--color-primary-dark); }
.search-pill__submit:disabled { cursor: not-allowed; opacity: .6; }

@media (max-width: 639px) {
  .search-pill__control { height: 48px; }
  .search-pill__submit { padding: 0 var(--space-4); }
}
</style>
