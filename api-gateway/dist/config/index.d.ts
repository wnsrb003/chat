export declare const config: {
    readonly env: string;
    readonly port: number;
    readonly grpcPort: number;
    readonly redis: {
        readonly host: string;
        readonly port: number;
        readonly password: string | undefined;
    };
    readonly queue: {
        readonly name: string;
        readonly maxJobs: number;
        readonly timeout: number;
    };
    readonly rateLimit: {
        readonly windowMs: number;
        readonly maxRequests: number;
    };
    readonly cors: {
        readonly origin: string;
    };
    readonly logging: {
        readonly level: string;
    };
    readonly cacheService: {
        readonly grpcUrl: string;
        readonly timeout: number;
    };
};
//# sourceMappingURL=index.d.ts.map