<script setup lang="ts">
import {onMounted,ref} from "vue";
const enabled=ref(false);
onMounted(async()=>{
  try{const response=await fetch('/api/public-config');if(response.ok)enabled.value=(await response.json()).demoMode===true;}catch{}
});
</script>
<template>
  <section v-if="enabled" class="demo-notice" aria-label="演示环境说明">
    <div><strong>在线演示环境</strong><p>使用下方公开胸片样例体验真实分析；记录为访客共享演示数据。删除、批量任务和草稿保存未开放，请勿输入个人信息。</p></div>
    <div class="demo-notice__links"><a href="/demo-samples/chest-pa-01.jpg" download>下载样例一</a><a href="/demo-samples/chest-pa-02.png" download>下载样例二</a></div>
  </section>
</template>
<style scoped>
.demo-notice{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;margin-bottom:24px;border:1px solid #c6e2e4;border-radius:14px;background:#eff8f8;color:#355d68}.demo-notice p{margin:6px 0 0;line-height:1.6;font-size:15px}.demo-notice__links{display:flex;gap:12px;flex-shrink:0}.demo-notice a{color:#28728c;text-decoration:none;font-weight:600}.demo-notice a:hover{text-decoration:underline}@media(max-width:900px){.demo-notice{align-items:flex-start;flex-direction:column}}
</style>
