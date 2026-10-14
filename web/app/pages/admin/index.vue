<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

await navigateTo('/admin/settings', { replace: true })
</script>
