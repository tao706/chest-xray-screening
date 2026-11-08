declare global {
    namespace Express {
        interface Request {
            authUser?: {
                id: number;
                username: string;
                displayName: string;
                role: string;
            };
        }
    }
}
export {};
