<script setup lang="ts">import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getRegistrationOptions, login, register } from "@/api/auth";
import { useAuthStore } from "@/state/auth";
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const username = ref("");
const displayName = ref("");
const password = ref("");
const confirmPassword = ref("");
const mode = ref<"login" | "register">("login");
const registrationEnabled = ref(false);
const registrationLoading = ref(true);
const submitting = ref(false);
const errorMessage = ref(route.query.unavailable === "1" ? "暂时无法连接业务服务，请确认Express和MySQL已经启动。" : "");
const showPassword = ref(false);
async function submit() {
    if (!username.value.trim() || !password.value)
        return void (errorMessage.value = "请输入用户名和密码");
    if (mode.value === "register") {
        if (!/^[A-Za-z0-9_-]{3,50}$/.test(username.value.trim()))
            return void (errorMessage.value = "用户名须为3至50位字母、数字、下划线或连字符");
        if (password.value.length < 8 ||
            !/[A-Za-z]/.test(password.value) ||
            !/[0-9]/.test(password.value))
            return void (errorMessage.value = "密码至少8位，且同时包含字母和数字");
        if (password.value !== confirmPassword.value)
            return void (errorMessage.value = "两次输入的密码不一致");
    }
    submitting.value = true;
    errorMessage.value = "";
    try {
        const user = mode.value === "register"
            ? await register(username.value.trim(), displayName.value.trim(), password.value)
            : await login(username.value.trim(), password.value);
        authStore.setUser(user);
        await router.replace(typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
            ? route.query.redirect
            : "/dashboard");
    }
    catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : mode.value === "register" ? "注册失败" : "登录失败";
    }
    finally {
        submitting.value = false;
    }
}
function switchMode(next: "login" | "register") {
    if (next === "register" && !registrationEnabled.value) {
        errorMessage.value = registrationLoading.value
            ? "正在检查注册是否开放，请稍候"
            : "当前未开放自主注册，请联系系统管理员";
        return;
    }
    mode.value = next;
    errorMessage.value = "";
    password.value = "";
    confirmPassword.value = "";
    showPassword.value = false;
}
onMounted(async () => {
    try {
        registrationEnabled.value = (await getRegistrationOptions()).enabled;
    }
    catch {
        registrationEnabled.value = false;
    }
    finally {
        registrationLoading.value = false;
    }
});
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="login-intro__content">
        <div class="login-intro__brand">
          <span class="login-intro__brand-mark" aria-hidden="true"></span>
          <div>
            <strong>胸片多标签智能筛查系统</strong>
            <small>CHEST IMAGING WORKSPACE</small>
          </div>
        </div>
        <div class="login-intro__hero">
          <p class="login-intro__eyebrow">胸部影像辅助分析平台</p>
          <h1>
            多图胸片
            <br />
            <span>智能辅助筛查</span>
          </h1>
          <p class="login-intro__description">让影像检查、结果呈现与人工复核有序衔接。</p>
          <div class="login-intro__features" aria-label="平台功能">
            <span>多图检查</span>
            <span>结果可视</span>
            <span>审阅留痕</span>
          </div>
        </div>
        <div class="login-intro__footer">
          <span>影像辅助分析</span>
          <span>以专业复核为准</span>
        </div>
      </div>
    </section>
    <section class="login-card">
      <p class="page-eyebrow">ACCOUNT ACCESS</p>
      <h2>{{ mode === "login" ? "欢迎回来" : "创建账号" }}</h2>
      <p>
        {{
          mode === "login"
            ? "登录后继续管理胸片检查与分析任务。"
            : "注册后可在团队工作区创建和查看检查记录。"
        }}
      </p>
      <div class="auth-tabs" role="group" aria-label="账号操作">
                                                   
        <button
          type="button"
          :class="{ 'auth-tabs__active': mode === 'login' }"
          :aria-pressed="mode === 'login'"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          :class="{ 'auth-tabs__active': mode === 'register' }"
          :aria-pressed="mode === 'register'"
          @click="switchMode('register')"
        >
          注册账号
        </button>
      </div>
      <form class="login-form-fields" @submit.prevent="submit">
        <div v-if="errorMessage" class="feedback-message feedback-message--error" role="alert">
          {{ errorMessage }}
        </div>
        <label class="form-field">
          <span>用户名</span>
                                                      
          <input
            v-model="username"
            autocomplete="username"
            maxlength="50"
            placeholder="请输入用户名"
            required
          />
        </label>
                                  
        <label v-if="mode === 'register'" class="form-field">
          <span>
            显示名称
            <small>选填</small>
          </span>
                                          
          <input
            v-model="displayName"
            autocomplete="nickname"
            maxlength="40"
            placeholder="例如：张医生"
          />
        </label>
        <label class="form-field">
          <span>密码</span>
          <div class="password-field">
                                                
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
              maxlength="128"
              :minlength="mode === 'register' ? 8 : 6"
              :placeholder="mode === 'register' ? '至少8位，包含字母和数字' : '请输入密码'"
              required
            />
            <button type="button" @click="showPassword = !showPassword">
              {{ showPassword ? "隐藏" : "显示" }}
            </button>
          </div>
        </label>
        <label v-if="mode === 'register'" class="form-field">
          <span>确认密码</span>
          <input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            maxlength="128"
            placeholder="再次输入密码"
            required
          />
        </label>
                                
        <button class="button button--primary button--wide" type="submit" :disabled="submitting">
          {{
            submitting
              ? mode === "register"
                ? "正在创建账号……"
                : "正在登录……"
              : mode === "register"
                ? "创建账号并进入"
                : "登录系统"
          }}
        </button>
      </form>
      <div class="auth-access-note">
        <span aria-hidden="true">◈</span>
        <p>
          {{
            mode === "register"
              ? "团队共享工作区：新账号可访问已有检查记录。请仅使用获授权的数据。"
              : "账号仅用于本系统。忘记密码请联系部署人员或系统管理员。"
          }}
        </p>
      </div>
    </section>
  </main>
</template>
