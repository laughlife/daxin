<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

await navigateTo('/admin/articles', { replace: true })
</script>
