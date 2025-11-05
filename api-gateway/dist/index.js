"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const translate_routes_1 = __importDefault(require("./routes/translate.routes"));
const swagger_1 = require("./config/swagger");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
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
// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        logger_1.logger.info({
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration,
        }, "HTTP request");
    });
    next();
});
// Swagger UI
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Chat Translation API Docs",
}));
// Routes
app.use("/api/v1", translate_routes_1.default);
// WebSocket
const wsService = new websocket_service_1.WebSocketService(server);
// Error handling
app.use((err, req, res) => {
    logger_1.logger.error({ url: req.url, err }, "Unhandled error");
    res.status(500).json({
        success: false,
        error: "Internal server error",
    });
});
// Graceful shutdown
const shutdown = async () => {
    logger_1.logger.info("Shutting down gracefully...");
    server.close(() => {
        logger_1.logger.info("HTTP server closed");
    });
    wsService.close();
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