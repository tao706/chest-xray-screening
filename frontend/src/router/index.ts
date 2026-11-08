import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "@/layouts/AppLayout.vue";
import LoginView from "@/views/LoginView.vue";
import DashboardView from "@/views/DashboardView.vue";
import NewStudyView from "@/views/NewStudyView.vue";
import ResultView from "@/views/ResultView.vue";
import StudiesView from "@/views/StudiesView.vue";
import StudyDetailView from "@/views/StudyDetailView.vue";
import BatchView from "@/views/BatchView.vue";
import SubmissionView from "@/views/SubmissionView.vue";
import AssistantView from "@/views/AssistantView.vue";
import AboutView from "@/views/AboutView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import { useAuthStore } from "@/state/auth";
import { pinia } from "@/state/pinia";
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/login",
            name: "login",
            component: LoginView,
            meta: {
                title: "登录",
                public: true
            }
        },
        {
            path: "/",
            component: AppLayout,
            children: [
                { path: "", redirect: "/dashboard" },
                {
                    path: "dashboard",
                    name: "dashboard",
                    component: DashboardView,
                    meta: { title: "运行总览" }
                },
                {
                    path: "studies/new",
                    name: "new-study",
                    component: NewStudyView,
                    meta: { title: "新建检查" }
                },
                {
                    path: "studies",
                    name: "studies",
                    component: StudiesView,
                    meta: { title: "检查记录" }
                },
                {
                    path: "studies/:studyId",
                    name: "study-detail",
                    component: StudyDetailView,
                    meta: { title: "检查详情" }
                },
                {
                    path: "studies/:studyId/result",
                    name: "result",
                    component: ResultView,
                    meta: { title: "推理结果" }
                },
                {
                    path: "batch",
                    name: "batch",
                    component: BatchView,
                    meta: { title: "批量推理" }
                },
                {
                    path: "submission",
                    name: "submission",
                    component: SubmissionView,
                    meta: { title: "提交文件" }
                },
                {
                    path: "assistant",
                    name: "assistant",
                    component: AssistantView,
                    meta: { title: "智能助手" }
                },
                {
                    path: "about",
                    name: "about",
                    component: AboutView,
                    meta: { title: "系统说明" }
                }
            ]
        },
        {
            path: "/:pathMatch(.*)*",
            name: "not-found",
            component: NotFoundView
        }
    ]
});
router.beforeEach(async (to) => {
    const authStore = useAuthStore(pinia);
    try {
        const user = await authStore.loadUser();
        if (to.meta.public && user)
            return typeof to.query.redirect === "string" ? to.query.redirect : "/dashboard";
        if (!to.meta.public && !user)
            return { name: "login", query: { redirect: to.fullPath } };
    }
    catch {
        if (!to.meta.public)
            return { name: "login", query: { redirect: to.fullPath, unavailable: "1" } };
    }
});
router.afterEach((to) => {
    const title = typeof to.meta.title === "string" ? to.meta.title : "页面";
    document.title = `${title} · 胸片多标签智能筛查`;
});
export default router;
