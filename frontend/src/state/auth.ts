import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { getCurrentUser } from "@/api/auth";
import { ApiError } from "@/api/http";
import type { AuthUser } from "@/types/auth";
export const useAuthStore = defineStore("auth", () => {
    const user = shallowRef<AuthUser | null>(null);
    const checked = ref(false);
    const loading = ref(false);
    const isAuthenticated = computed(() => user.value !== null);
    let pendingLoad: Promise<AuthUser | null> | null = null;
    async function loadUser(force = false): Promise<AuthUser | null> {
        if (checked.value && !force)
            return user.value;
        if (pendingLoad)
            return pendingLoad;
        loading.value = true;
        pendingLoad = (async () => {
            try {
                user.value = await getCurrentUser();
            }
            catch (error) {
                user.value = null;
                if (!(error instanceof ApiError && error.status === 401))
                    throw error;
            }
            finally {
                checked.value = true;
                loading.value = false;
            }
            return user.value;
        })();
        try {
            return await pendingLoad;
        }
        finally {
            pendingLoad = null;
        }
    }
    function setUser(nextUser: AuthUser) {
        user.value = nextUser;
        checked.value = true;
    }
    function clearUser() {
        user.value = null;
        checked.value = true;
    }
    return { user, checked, loading, isAuthenticated, loadUser, setUser, clearUser };
});
