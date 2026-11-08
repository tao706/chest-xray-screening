import mysql from "mysql2/promise";
import { env } from "./env.js";
export const database = mysql.createPool({
    ...env.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
});
export async function checkDatabase() {
    try {
        await database.query("SELECT 1");
        return { status: "healthy" as const };
    }
    catch (error) {
        return {
            status: "unavailable" as const,
            message: error instanceof Error ? error.message : "数据库连接失败"
        };
    }
}
