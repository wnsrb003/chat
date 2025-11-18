"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    env: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT || "3000", 10),
    grpcPort: parseInt(process.env.GRPC_PORT || "50051", 10),
    redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    queue: {
        name: process.env.QUEUE_NAME || "translation-jobs",
        maxJobs: parseInt(process.env.QUEUE_MAX_JOBS || "1000", 10),
        timeout: parseInt(process.env.QUEUE_TIMEOUT || "30000", 10),
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
    },
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
    },
    logging: {
        level: process.env.LOG_LEVEL || "warn", // info → warn (CPU 절약)
    },
    cacheService: {
        protocol: (process.env.CACHE_SERVICE_PROTOCOL || "grpc"),
        grpcUrl: process.env.CACHE_SERVICE_GRPC_URL || "192.168.190.158:50051",
        httpUrl: process.env.CACHE_SERVICE_HTTP_URL || "http://192.168.190.158:8000",
        timeout: parseInt(process.env.CACHE_SERVICE_TIMEOUT || "30000", 10),
    },
};
//# sourceMappingURL=index.js.map