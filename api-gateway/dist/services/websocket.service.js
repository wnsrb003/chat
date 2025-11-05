"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const zod_1 = require("zod");
const queue_service_1 = require("./queue.service");
const logger_1 = require("../utils/logger");
const crypto_1 = require("crypto");
const wsMessageSchema = zod_1.z.object({
    type: zod_1.z.enum(["translate", "ping"]),
    text: zod_1.z.string().min(1).max(5000).optional(),
    targetLanguages: zod_1.z.array(zod_1.z.string()).min(1).max(10).optional(),
    options: zod_1.z
        .object({
        expandAbbreviations: zod_1.z.boolean().optional().default(true),
        filterProfanity: zod_1.z.boolean().optional().default(false),
        normalizeRepeats: zod_1.z.boolean().optional().default(true),
        removeEmoticons: zod_1.z.boolean().optional().default(true),
        fixTypos: zod_1.z.boolean().optional().default(false),
    })
        .optional(),
});
class WebSocketService {
    wss;
    clients = new Map();
    constructor(server) {
        this.wss = new ws_1.WebSocketServer({
            server,
            path: "/ws",
        });
        this.setupWebSocketServer();
    }
    setupWebSocketServer() {
        this.wss.on("connection", (ws) => {
            const clientId = (0, crypto_1.randomUUID)();
            this.clients.set(clientId, ws);
            logger_1.logger.info({ clientId }, "WebSocket client connected");
            ws.send(JSON.stringify({
                type: "connected",
                clientId,
                message: "Connected to translation service",
            }));
            ws.on("message", async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    logger_1.logger.info({ message, clientId }, "WebSocket message received");
                    await this.handleMessage(ws, clientId, message);
                }
                catch (error) {
                    logger_1.logger.error({ error, clientId }, "WebSocket message error");
                    ws.send(JSON.stringify({
                        type: "error",
                        error: "Invalid message format",
                    }));
                }
            });
            ws.on("close", () => {
                this.clients.delete(clientId);
                logger_1.logger.info({ clientId }, "WebSocket client disconnected");
            });
            ws.on("error", (error) => {
                logger_1.logger.error({ error, clientId }, "WebSocket error");
            });
            // Heartbeat
            const interval = setInterval(() => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.ping();
                }
                else {
                    clearInterval(interval);
                }
            }, 30000);
        });
    }
    async handleMessage(ws, clientId, message) {
        try {
            const validatedMessage = wsMessageSchema.parse(message);
            if (validatedMessage.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }
            if (validatedMessage.type === "translate") {
                if (!validatedMessage.text || !validatedMessage.targetLanguages) {
                    ws.send(JSON.stringify({
                        type: "error",
                        error: "Missing required fields: text and targetLanguages",
                    }));
                    return;
                }
                const jobId = (0, crypto_1.randomUUID)();
                // Add job to queue
                const job = await queue_service_1.queueService.addJob({
                    id: jobId,
                    text: validatedMessage.text,
                    targetLanguages: validatedMessage.targetLanguages,
                    options: validatedMessage.options,
                    createdAt: Date.now(),
                });
                // Send acknowledgment
                ws.send(JSON.stringify({
                    type: "queued",
                    jobId: job.id,
                }));
                // Wait for result and send back
                try {
                    const result = await queue_service_1.queueService.waitForResult(jobId);
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: "result",
                            jobId,
                            data: result,
                        }));
                    }
                }
                catch (error) {
                    logger_1.logger.error({ error, jobId, clientId }, "Translation failed in WebSocket");
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: "error",
                            jobId,
                            error: "Translation failed or timeout",
                        }));
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                ws.send(JSON.stringify({
                    type: "error",
                    error: "Validation error",
                    details: error.errors,
                }));
            }
            else {
                logger_1.logger.error({ error, clientId }, "Message handling error");
                ws.send(JSON.stringify({
                    type: "error",
                    error: "Internal server error",
                }));
            }
        }
    }
    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
    close() {
        this.clients.forEach((client) => client.close());
        this.wss.close();
        logger_1.logger.info("WebSocket server closed");
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocket.service.js.map