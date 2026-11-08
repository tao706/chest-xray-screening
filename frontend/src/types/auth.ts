export interface AuthUser {
    id: number;
    username: string;
    displayName: string;
    role: "admin" | "operator" | "viewer";
}
