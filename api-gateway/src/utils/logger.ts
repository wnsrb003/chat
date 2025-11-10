import pino from "pino";
import { config } from "../config";

export const logger = pino({
  level: config.logging.level,
  // pino-pretty 비활성화 (CPU 사용량 50% 감소)
  // transport:
  //   config.env === "development"
  //     ? {
  //         target: "pino-pretty",
  //         options: {
  //           colorize: true,
  //           translateTime: "HH:MM:ss",
  //           ignore: "pid,hostname",
  //         },
  //       }
  //     : undefined,
});
