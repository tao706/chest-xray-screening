<script setup lang="ts">import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { navigationItems } from "@/config/navigation";
import { logout } from "@/api/auth";
import { useAuthStore } from "@/state/auth";
import { useRouter } from "vue-router";
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { user: authUser } = storeToRefs(authStore);
const pageTitle = computed(() => String(route.meta.title ?? "系统页面"));
const accountName = computed(() => {
    const user = authUser.value;
    return user?.displayName?.trim() || user?.username || "当前用户";
});
const accountInitial = computed(() => accountName.value.slice(0, 1));
const accountRole = computed(() => ({
    admin: "系统管理员",
    operator: "操作员",
    viewer: "只读用户"
})[authUser.value?.role ?? "viewer"]);
async function signOut() {
    try {
        await logout();
    }
    finally {
        authStore.clearUser();
        await router.replace("/login");
    }
}
</script>

<template>
  <div class="app-shell">
                
    <aside class="sidebar"> 
      <RouterLink class="brand" to="/dashboard">
        <span class="brand__icon">▣</span>
        <span>
          <strong>胸片多标签智能筛查</strong>
          <small>Chest X-ray Multi-label</small>
        </span>
      </RouterLink>

      <p class="sidebar__caption">功能导航</p>
      <nav class="navigation" aria-label="主导航">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to" 
          class="navigation__item"
        >
          <span class="navigation__icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar__footer">
        <div class="service-mini">
          <strong>当前版本</strong>
          <span><i></i> 影像分析服务</span>
        </div>
        <p>分析结果仅供辅助参考<br />请由专业人员结合原始影像复核。</p>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div>
          <span>胸片筛查系统</span>
          <i>/</i>
          <strong>{{ pageTitle }}</strong>
        </div>
        <div class="topbar__status">
          <span class="topbar-environment" title="胸片影像辅助分析">
            <i aria-hidden="true"></i> 分析服务 <small>已接入</small>
          </span>
          <span class="topbar-divider" aria-hidden="true"></span>
          <details class="topbar-account">
                                                           
                                             
            <summary :aria-label="`账户菜单：${accountName}`">
              <span class="topbar-avatar">{{ accountInitial }}</span>
              <span class="topbar-account__identity">
                <strong>{{ accountName }}</strong><small>{{ accountRole }}</small>
              </span>
              <span class="topbar-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="topbar-account__menu">
              <div class="topbar-account__menu-header">
                <strong>{{ accountName }}</strong>
                <small>{{ accountRole }} · {{ authUser?.username }}</small>
              </div>
                                                                        
                                                     
              <RouterLink to="/about" @click="($event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')">系统说明 <span>↗</span></RouterLink>
                                                  
              <button type="button" @click="signOut">退出登录 <span>→</span></button>
            </div>
          </details>
        </div>
      </header>

      <main class="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

