<script setup lang="ts">
import { qrChannels } from '~/data/mock/qr'
const props = withDefaults(defineProps<{ group?: 'tro' | 'labor' | 'all'; kind?: 'all' | 'public' | 'consult' }>(), { group: 'all', kind: 'all' })
const channels = computed(() => qrChannels.filter(item => (props.group === 'all' || item.group === props.group) && (props.kind === 'all' || item.kind === props.kind)))
</script>
<template>
  <div class="contact-qr-grid" :class="{ 'contact-qr-grid--single': channels.length === 1 }">
    <figure v-for="channel in channels" :key="channel.id" :data-qr-id="channel.id">
      <img :src="channel.qrSrc" :alt="`${channel.name}二维码`" width="160" height="160" loading="lazy">
      <figcaption><strong>{{ channel.name }}</strong><span>{{ channel.kind === 'public' ? '扫码关注 · 获取资讯' : '扫码咨询 · 免费初步评估' }}</span></figcaption>
    </figure>
  </div>
</template>
<style scoped>
.contact-qr-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
figure { margin:0; min-width:0; text-align:center; }
img { display:block; width:100%; max-width:180px; height:auto; aspect-ratio:1; object-fit:contain; margin:0 auto 8px; background:white; border:8px solid white; border-radius:8px; }
figcaption { display:flex; flex-direction:column; gap:6px; font-size:12px; }
figcaption strong { font-size:14px; }
.contact-qr-grid--single { grid-template-columns:1fr; }
.contact-qr-grid--single img { max-width:240px; }
</style>
