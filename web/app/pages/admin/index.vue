<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

await navigateTo('/admin/cases', { replace: true })
</script>
