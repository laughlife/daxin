<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ADMIN_PAGE_SIZE_OPTIONS,
  adminRequestErrorMessage,
  toAdminQuery,
  toPageMeta,
  type AdminPageMeta
} from '~/utils/adminApi'

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '产品侵权检测',
  robots: 'noindex, nofollow'
})

interface InfringementCheckRecord {
  id: number
  brand: string
  product: string
  contactName: string
  contactWay: string
  remark: string
  createdAt: string
}

interface InfringementCheckListPayload {
  items: InfringementCheckRecord[]
  meta: AdminPageMeta
}

const requestFetch = useRequestFetch()
const page = ref(1)
const pageSize = ref(20)
const listKey = computed(() => `admin-infringement-checks:${page.value}:${pageSize.value}`)

const {
  data: listData,
  status: listStatus,
  error: listError,
  refresh: refreshList
} = await useAsyncData<InfringementCheckListPayload>(
  listKey,
  async () => {
    const payload = await requestFetch<{
      data?: InfringementCheckRecord[]
      meta?: Record<string, unknown>
    }>('/api/admin/infringement-checks', {
      query: toAdminQuery({ page: page.value, pageSize: pageSize.value })
    })
    return {
      items: Array.isArray(payload?.data) ? payload.data : [],
      meta: toPageMeta(payload?.meta, { page: page.value, pageSize: pageSize.value })
    }
  },
  {
    default: (): InfringementCheckListPayload => ({
      items: [],
      meta: { page: page.value, pageSize: pageSize.value, total: 0, totalPages: 1 }
    })
  }
)

const items = computed(() => listData.value.items)
const meta = computed(() => listData.value.meta)
const isLoading = computed(() => listStatus.value === 'pending')
const listErrorMessage = computed(() => adminRequestErrorMessage(listError.value, '产品侵权检测记录加载失败，请稍后重试'))
</script>

<template>
  <PageContainer class="admin-infringement-checks">
    <SectionHeading :level="1" title="产品侵权检测记录" />

    <ErrorState
      v-if="listError"
      title="记录加载失败"
      :message="listErrorMessage"
      @retry="refreshList"
    />

    <template v-else>
      <p v-if="isLoading" class="admin-infringement-checks__loading" role="status">正在加载记录…</p>

      <div v-if="items.length" class="admin-infringement-checks__table-wrap">
        <table class="admin-infringement-checks__table">
          <caption>
            共 {{ meta.total }} 条记录，第 {{ meta.page }} / {{ meta.totalPages }} 页
          </caption>
          <thead>
            <tr>
              <th scope="col">提交时间</th>
              <th scope="col">品牌名称</th>
              <th scope="col">产品名称</th>
              <th scope="col">联系人</th>
              <th scope="col">电话或微信</th>
              <th scope="col">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="admin-infringement-checks__date">{{ item.createdAt || '—' }}</td>
              <td>{{ item.brand || '—' }}</td>
              <td>{{ item.product || '—' }}</td>
              <td>{{ item.contactName || '—' }}</td>
              <td>{{ item.contactWay || '—' }}</td>
              <td class="admin-infringement-checks__remark">{{ item.remark || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-else-if="!isLoading" class="admin-infringement-checks__empty">暂无产品侵权检测记录</p>

      <AdminPager
        :page="meta.page"
        :total-pages="meta.totalPages"
        :total="meta.total"
        :page-size="meta.pageSize"
        noun="条记录"
        :page-sizes="[...ADMIN_PAGE_SIZE_OPTIONS]"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
      />
    </template>
  </PageContainer>
</template>

<style scoped>
.admin-infringement-checks {
  padding-block: var(--space-8) var(--space-16);
}

.admin-infringement-checks__loading,
.admin-infringement-checks__empty {
  margin-top: var(--space-5);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.admin-infringement-checks__table-wrap {
  margin-top: var(--space-5);
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
}

.admin-infringement-checks__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.admin-infringement-checks__table caption {
  padding: var(--space-3);
  color: var(--color-text-muted);
  text-align: left;
}

.admin-infringement-checks__table th,
.admin-infringement-checks__table td {
  padding: var(--space-3);
  border-top: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.admin-infringement-checks__table th {
  background: var(--color-bg-light);
  color: var(--color-text);
  font-weight: 600;
  white-space: nowrap;
}

.admin-infringement-checks__date {
  min-width: 150px;
  white-space: nowrap;
}

.admin-infringement-checks__remark {
  min-width: 200px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
