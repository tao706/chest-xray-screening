export interface NavigationItem {
    label: string;
    to: string;
    icon: string;
}
export const navigationItems: NavigationItem[] = [
    { label: "首页", to: "/dashboard", icon: "▦" },
    { label: "新建检查", to: "/studies/new", icon: "✚" },
    { label: "检查记录", to: "/studies", icon: "▣" },
    { label: "批量推理", to: "/batch", icon: "▧" },
    { label: "提交文件", to: "/submission", icon: "▤" },
    { label: "智能助手", to: "/assistant", icon: "◈" },
    { label: "系统说明", to: "/about", icon: "▥" }
];
