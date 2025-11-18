export declare const config: {
    env: string;
    port: number;
    grpcPort: number;
    redis: {
        host: string;
        port: number;
        password: string | undefined;
    };
    queue: {
        name: string;
        maxJobs: number;
        timeout: number;
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    cors: {
        origin: string;
    };
    logging: {
        level: string;
    };
    cacheService: {
        protocol: "grpc" | "http";
        grpcUrl: string;
        httpUrl: string;
        timeout: number;
    };
};
//# sourceMappingURL=index.d.ts.map