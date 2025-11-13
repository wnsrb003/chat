import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer } from "http";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
import { logger } from "./utils/logger";
import { queueService } from "./services/queue.service";
import { WebSocketService } from "./services/websocket.service";
import translateRoutes, {
  setWebSocketService,
} from "./routes/translate.routes";
import { swaggerSpec } from "./config/swagger";

const app = express();
const server = createServer(app);

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
export const getHttpRps = () => lastHttpRps;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "validator.swagger.io"],
      },
    },
  })
);
app.use(cors({ origin: config.cors.origin }));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging and RPS counting
app.use((req, res, next) => {
  httpRequestCounter++; // RPS 카운터
  // const start = Date.now();
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
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Chat Translation API Docs",
  })
);

// WebSocket
export const wsService = new WebSocketService(server);

// Set WebSocket service for routes
setWebSocketService(wsService);

// Routes
app.use("/api/v1", translateRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response) => {
  logger.error({ url: req.url, err }, "Unhandled error");
  // res.status(500).json({
  //   success: false,
  //   error: "Internal server error",
  // });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down gracefully...");

  server.close(() => {
    logger.info("HTTP server closed");
  });

  wsService.close();
  await queueService.close();

  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
server.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.env,
    },
    "API Gateway started"
  );
  logger.info(`HTTP/WebSocket: http://localhost:${config.port}`);
  logger.info(`API Docs: http://localhost:${config.port}/api-docs`);
  logger.info(`WebSocket: ws://localhost:${config.port}/ws`);
  logger.info(`Health: http://localhost:${config.port}/api/v1/health`);
});
