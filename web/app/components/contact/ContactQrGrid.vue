<script setup lang="ts">
import { qrChannels } from '~/data/mock/qr'
const props = withDefaults(defineProps<{ group?: 'tro' | 'labor' | 'all'; kind?: 'all' | 'public' | 'consult' }>(), { group: 'all', kind: 'all' })
const channels = computed(() => qrChannels.filter(item => (props.group === 'all' || item.group === props.group) && (props.kind === 'all' || item.kind === props.kind)))
const feedback = ref('')
const { copy } = useCopyText()
async function copyId(id: string) { feedback.value = await copy(id) ? `已复制：${id}` : `请手动复制：${id}` }
</script>
<template>
  <div class="contact-qr-grid">
    <figure v-for="channel in channels" :key="channel.id" :data-qr-id="channel.id">
      <img :src="channel.qrSrc" :alt="`${channel.name}二维码`" width="160" height="160" loading="lazy">
      <figcaption><strong>{{ channel.name }}</strong><button v-if="channel.wechatId" type="button" :aria-label="`复制${channel.name} ${channel.wechatId}`" @click="copyId(channel.wechatId)">{{ channel.wechatId }} · 复制</button><span v-else>扫码关注 · 获取资讯</span></figcaption>
    </figure>
    <p v-if="feedback" class="contact-qr-grid__feedback" role="status">{{ feedback }}</p>
  </div>
</template>
<style scoped>
.contact-qr-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
figure { margin:0; min-width:0; text-align:center; }
img { display:block; width:100%; max-width:180px; height:auto; aspect-ratio:1; object-fit:contain; margin:0 auto 8px; background:white; border:8px solid white; border-radius:8px; }
figcaption { display:flex; flex-direction:column; gap:6px; font-size:12px; }
figcaption strong { font-size:14px; }
button { color:var(--color-primary); border:1px solid var(--color-border); border-radius:6px; padding:5px 2px; background:white; cursor:pointer; overflow-wrap:anywhere; }
.contact-qr-grid__feedback { grid-column:1/-1; font-size:12px; }
</style>
