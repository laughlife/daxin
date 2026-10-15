<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

interface CheckForm {
  brand: string
  product: string
  contactName: string
  contactWay: string
  remark: string
}

const form = reactive<CheckForm>({
  brand: '',
  product: '',
  contactName: '',
  contactWay: '',
  remark: ''
})

const errors = reactive<Record<keyof CheckForm, string>>({
  brand: '',
  product: '',
  contactName: '',
  contactWay: '',
  remark: ''
})

const submitted = ref(false)
const isSubmitting = ref(false)
const submitError = ref('')

const fieldRules: Array<{
  key: keyof CheckForm
  label: string
  required: boolean
}> = [
  { key: 'brand', label: '品牌名称', required: true },
  { key: 'product', label: '产品名称', required: true },
  { key: 'contactName', label: '联系人', required: true },
  { key: 'contactWay', label: '电话或微信', required: true },
  { key: 'remark', label: '备注', required: false }
]

const errorCount = computed(
  () => fieldRules.filter(rule => errors[rule.key]).length
)

function validateField(key: keyof CheckForm) {
  const rule = fieldRules.find(item => item.key === key)
  if (!rule) return
  if (rule.required && !form[key].trim()) {
    errors[key] = `请填写${rule.label}`
  } else {
    errors[key] = ''
  }
}

async function onSubmit() {
  for (const rule of fieldRules) {
    validateField(rule.key)
  }
  if (errorCount.value > 0 || isSubmitting.value) return

  isSubmitting.value = true
  submitError.value = ''
  try {
    await $fetch('/api/public/infringement-check', {
      method: 'POST',
      body: { ...form }
    })
    submitted.value = true
  } catch {
    submitError.value = '提交失败，请稍后重试；填写内容已保留。'
  } finally {
    isSubmitting.value = false
  }
}

function onReset() {
  for (const rule of fieldRules) {
    form[rule.key] = ''
    errors[rule.key] = ''
  }
  submitted.value = false
  submitError.value = ''
}

useSeoMeta({
  title: '产品侵权检测',
  description: '填写产品与联系方式，了解产品侵权检测服务。',
  ogTitle: '产品侵权检测 - 大信法务',
  ogDescription: '了解大信法务产品侵权检测服务。'
})
</script>

<template>
  <div class="check-page">
    <PageContainer><ContentColumns group="tro">
      <SectionHeading
        :level="1"
        title="产品侵权检测"
      />
      <div v-if="submitted" class="check-page__success" role="status">
        <p class="check-page__success-title">提交成功</p>
        <p class="check-page__success-desc">
          我们已收到你的产品检测申请，工作人员将根据你填写的联系方式与您沟通。
        </p>
        <BaseButton variant="secondary" @click="onReset">重新填写</BaseButton>
      </div>

      <form v-else class="check-page__form" novalidate @submit.prevent="onSubmit">
        <p v-if="submitError" class="check-page__submit-error" role="alert">{{ submitError }}</p>
        <div class="check-page__field">
          <label for="check-brand">品牌名称 <span aria-hidden="true" class="check-page__required">*</span></label>
          <input
            id="check-brand"
            v-model="form.brand"
            type="text"
            autocomplete="off"
            :aria-invalid="errors.brand ? 'true' : undefined"
            :aria-describedby="errors.brand ? 'check-brand-error' : undefined"
            @blur="validateField('brand')"
          >
          <p v-if="errors.brand" id="check-brand-error" class="check-page__error" role="alert">
            {{ errors.brand }}
          </p>
        </div>

        <div class="check-page__field">
          <label for="check-product">产品名称 <span aria-hidden="true" class="check-page__required">*</span></label>
          <input
            id="check-product"
            v-model="form.product"
            type="text"
            autocomplete="off"
            :aria-invalid="errors.product ? 'true' : undefined"
            :aria-describedby="errors.product ? 'check-product-error' : undefined"
            @blur="validateField('product')"
          >
          <p v-if="errors.product" id="check-product-error" class="check-page__error" role="alert">
            {{ errors.product }}
          </p>
        </div>

        <div class="check-page__row">
          <div class="check-page__field">
            <label for="check-contact-name">联系人 <span aria-hidden="true" class="check-page__required">*</span></label>
            <input
              id="check-contact-name"
              v-model="form.contactName"
              type="text"
              autocomplete="off"
              :aria-invalid="errors.contactName ? 'true' : undefined"
              :aria-describedby="errors.contactName ? 'check-contact-name-error' : undefined"
              @blur="validateField('contactName')"
            >
            <p v-if="errors.contactName" id="check-contact-name-error" class="check-page__error" role="alert">
              {{ errors.contactName }}
            </p>
          </div>
          <div class="check-page__field">
            <label for="check-contact-way">电话或微信 <span aria-hidden="true" class="check-page__required">*</span></label>
            <input
              id="check-contact-way"
              v-model="form.contactWay"
              type="text"
              autocomplete="off"
              :aria-invalid="errors.contactWay ? 'true' : undefined"
              :aria-describedby="errors.contactWay ? 'check-contact-way-error' : undefined"
              @blur="validateField('contactWay')"
            >
            <p v-if="errors.contactWay" id="check-contact-way-error" class="check-page__error" role="alert">
              {{ errors.contactWay }}
            </p>
          </div>
        </div>

        <div class="check-page__field">
          <label for="check-remark">备注</label>
          <textarea
            id="check-remark"
            v-model="form.remark"
            rows="4"
          />
        </div>

        <div class="check-page__actions">
          <BaseButton type="submit" variant="primary" size="lg" :disabled="isSubmitting">
            {{ isSubmitting ? '正在提交…' : '提交检测' }}
          </BaseButton>
        </div>
      </form>
    </ContentColumns></PageContainer>
  </div>
</template>

<style scoped>
.check-page {
  padding-block: var(--space-10) var(--space-16);
  background-color: var(--color-bg-light);
  min-height: 60vh;
}

.check-page__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  margin-top: var(--space-6);
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.check-page__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.check-page__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.check-page__field label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.check-page__required {
  color: var(--color-error);
}

.check-page__field input,
.check-page__field textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--text-sm);
  color: var(--color-text);
  background-color: var(--color-bg-page);
  resize: vertical;
}

.check-page__field input[aria-invalid='true'],
.check-page__field textarea[aria-invalid='true'] {
  border-color: var(--color-error);
}

.check-page__error {
  font-size: var(--text-xs);
  color: var(--color-error);
}

.check-page__submit-error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--text-sm);
}

.check-page__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.check-page__success {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding: var(--space-8) var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid color-mix(in srgb, var(--color-success) 40%, var(--color-border));
  border-radius: var(--radius-lg);
}

.check-page__success-title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-success);
}

.check-page__success-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

@media (max-width: 639px) {
  .check-page__row {
    grid-template-columns: 1fr;
  }

  .check-page__form {
    padding: var(--space-4);
  }
}
</style>
