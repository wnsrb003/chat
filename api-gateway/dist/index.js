"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsService = exports.getHttpRps = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const http_1 = require("http");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const queue_service_1 = require("./services/queue.service");
const websocket_service_1 = require("./services/websocket.service");
const translate_routes_1 = __importStar(require("./routes/translate.routes"));
const swagger_1 = require("./config/swagger");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// RPS 모니터링 카운터
let httpRequestCounter = 0;
let lastHttpRps = 0;
// 1초마다 RPS 출력
setInterval(() => {
    lastHttpRps = httpRequestCounter;
    // logger.info({
    //   metric: "API_GATEWAY_HTTP",
    //   rps: httpRequestCounter,
    // });
    httpRequestCounter = 0;
}, 1000);
// RPS 카운터 조회 함수 export
const getHttpRps = () => lastHttpRps;
exports.getHttpRps = getHttpRps;
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "validator.swagger.io"],
        },
    },
}));
app.use((0, cors_1.default)({ origin: config_1.config.cors.origin }));
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
// Request logging and RPS counting
app.use((req, res, next) => {
    httpRequestCounter++; // RPS 카운터
    // const start = Date.now();
    req.on("end", () => { });
    res.on("finish", () => {
        // const duration = Date.now() - start;
        // logger.info(
        //   {
        //     method: req.method,
        //     url: req.url,
        //     status: res.statusCode,
        //     duration,
        //   },
        //   "HTTP request"
        // );
    });
    next();
});
// Swagger UI
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Chat Translation API Docs",
}));
// WebSocket
exports.wsService = new websocket_service_1.WebSocketService(server);
// Set WebSocket service for routes
(0, translate_routes_1.setWebSocketService)(exports.wsService);
// Routes
app.use("/api/v1", translate_routes_1.default);
// Error handling
app.use((err, req) => {
    logger_1.logger.error({ url: req.url, err }, "Unhandled error");
    // res.status(500).json({
    //   success: false,
    //   error: "Internal server error",
    // });
});
// Graceful shutdown
const shutdown = async () => {
    logger_1.logger.info("Shutting down gracefully...");
    server.close(() => {
        logger_1.logger.info("HTTP server closed");
    });
    exports.wsService.close();
    await queue_service_1.queueService.close();
    process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// Start server
server.listen(config_1.config.port, () => {
    logger_1.logger.info({
        port: config_1.config.port,
        env: config_1.config.env,
    }, "API Gateway started");
    logger_1.logger.info(`HTTP/WebSocket: http://localhost:${config_1.config.port}`);
    logger_1.logger.info(`API Docs: http://localhost:${config_1.config.port}/api-docs`);
    logger_1.logger.info(`WebSocket: ws://localhost:${config_1.config.port}/ws`);
    logger_1.logger.info(`Health: http://localhost:${config_1.config.port}/api/v1/health`);
});
//# sourceMappingURL=index.js.map