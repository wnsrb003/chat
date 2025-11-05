import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { z } from "zod";
import { queueService, TranslationResult } from "./queue.service";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";

const wsMessageSchema = z.object({
  type: z.enum(["translate", "ping"]),
  text: z.string().min(1).max(5000).optional(),
  targetLanguages: z.array(z.string()).min(1).max(10).optional(),
  options: z
    .object({
      expandAbbreviations: z.boolean().optional().default(true),
      filterProfanity: z.boolean().optional().default(false),
      normalizeRepeats: z.boolean().optional().default(true),
      removeEmoticons: z.boolean().optional().default(true),
      fixTypos: z.boolean().optional().default(false),
    })
    .optional(),
});

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
    });

    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = randomUUID();
      this.clients.set(clientId, ws);

      logger.info({ clientId }, "WebSocket client connected");

      ws.send(
        JSON.stringify({
          type: "connected",
          clientId,
          message: "Connected to translation service",
        })
      );

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          // logger.info({ message, clientId }, "WebSocket message received");
          await this.handleMessage(ws, clientId, message);
        } catch (error) {
          logger.error({ error, clientId }, "WebSocket message error");
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Invalid message format",
            })
          );
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        logger.info({ clientId }, "WebSocket client disconnected");
      });

      ws.on("error", (error) => {
        logger.error({ error, clientId }, "WebSocket error");
      });

      // Heartbeat
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(interval);
        }
      }, 30000);
    });
  }

  private async handleMessage(ws: WebSocket, clientId: string, message: any) {
    try {
      const validatedMessage = wsMessageSchema.parse(message);

      if (validatedMessage.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (validatedMessage.type === "translate") {
        if (!validatedMessage.text || !validatedMessage.targetLanguages) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Missing required fields: text and targetLanguages",
            })
          );
          return;
        }

        const jobId = randomUUID();

        // Add job to queue
        const job = await queueService.addJob({
          id: jobId,
          text: validatedMessage.text,
          targetLanguages: validatedMessage.targetLanguages,
          options: validatedMessage.options,
          createdAt: Date.now(),
        });

        // Send acknowledgment
        ws.send(
          JSON.stringify({
            type: "queued",
            jobId: job.id,
          })
        );

        // Wait for result and send back
        try {
          const now = performance.now();
          const result: TranslationResult = await queueService.waitForResult(
            jobId
          );

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "result",
                jobId,
                data: JSON.parse(result as string),
              })
            );

            console.log("ws.send time", performance.now() - now);
          }
        } catch (error) {
          logger.error(
            { error, jobId, clientId },
            "Translation failed in WebSocket"
          );
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "error",
                jobId,
                error: "Translation failed or timeout",
              })
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Validation error",
            details: error.errors,
          })
        );
      } else {
        logger.error({ error, clientId }, "Message handling error");
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Internal server error",
          })
        );
      }
    }
  }

  broadcast(message: any) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  close() {
    this.clients.forEach((client) => client.close());
    this.wss.close();
    logger.info("WebSocket server closed");
  }
}
