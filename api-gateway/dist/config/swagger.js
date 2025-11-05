"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const config_1 = require("../config");
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Chat Translation Service API",
            version: "1.0.0",
            description: `High-performance chat translation service with Korean text preprocessing

## WebSocket API

### Connection
\`\`\`
ws://localhost:${config_1.config.port}/ws
\`\`\`

### Client → Server Messages

**1. Translate Request**
\`\`\`json
{
  "type": "translate",
  "text": "안녕하세요",
  "targetLanguages": ["en","th", "zh-CN", "zh-TW"],
  "options": {
    "expandAbbreviations": true,
    "normalizeRepeats": true,
    "removeEmoticons": true
  }
}
\`\`\`

**2. Ping (Heartbeat)**
\`\`\`json
{
  "type": "ping"
}
\`\`\`

### Server → Client Messages

**1. Connected**
\`\`\`json
{
  "type": "connected",
  "clientId": "uuid",
  "message": "Connected to translation service"
}
\`\`\`

**2. Queued**
\`\`\`json
{
  "type": "queued",
  "jobId": "uuid"
}
\`\`\`

**3. Result**
\`\`\`json
{
  "type": "result",
  "jobId": "uuid",
  "data": {
    "jobId": "uuid",
    "original": "안녕하세요",
    "preprocessed": "안녕하세요",
    "translations": {
      "en": "Hello",
      "th": "สวัสดี",
      "zh-CN": "你好",
      "zh-TW": "你好"
    },
    "detectedLanguage": "ko",
    "timing": {
      "preprocessing": 7,
      "languageDetection": 15,
      "translation": 850,
      "total": 872
    }
  }
}
\`\`\`

**4. Pong**
\`\`\`json
{
  "type": "pong"
}
\`\`\`

**5. Error**
\`\`\`json
{
  "type": "error",
  "error": "Error message",
  "details": []
}
\`\`\`

### Features
- Auto-reconnection support
- Server-side heartbeat (30s interval)
- Real-time translation results
`,
            contact: {
                name: "API Support",
            },
        },
        servers: [
            {
                url: `http://localhost:${config_1.config.port}`,
                description: "Development server",
            },
            {
                url: "https://api.yourdomain.com",
                description: "Production server",
            },
        ],
        tags: [
            {
                name: "Translation",
                description: "Translation endpoints (HTTP REST API)",
            },
            {
                name: "Jobs",
                description: "Job status endpoints",
            },
            {
                name: "Spell Check",
                description: "Korean spell checking",
            },
            {
                name: "Health",
                description: "Health check endpoints",
            },
            {
                name: "WebSocket",
                description: "WebSocket API for real-time translation (see description above for details)",
            },
        ],
        components: {
            schemas: {
                TranslateRequest: {
                    type: "object",
                    required: ["text", "targetLanguages"],
                    properties: {
                        text: {
                            type: "string",
                            description: "Text to translate",
                            minLength: 1,
                            maxLength: 5000,
                            example: "안녕하세요",
                        },
                        targetLanguages: {
                            type: "array",
                            description: "Target languages (ISO 639-1 codes)",
                            minItems: 1,
                            maxItems: 10,
                            items: {
                                type: "string",
                                example: "en",
                            },
                            example: ["en", "th", "zh-CN", "zh-TW"],
                        },
                        options: {
                            type: "object",
                            description: "Preprocessing options",
                            properties: {
                                expandAbbreviations: {
                                    type: "boolean",
                                    description: "Expand Korean abbreviations (e.g., ㅇㅇ → 응응)",
                                    default: true,
                                },
                                filterProfanity: {
                                    type: "boolean",
                                    description: "Filter profanity",
                                    default: false,
                                },
                                normalizeRepeats: {
                                    type: "boolean",
                                    description: "Normalize repeated characters (e.g., ㅋㅋㅋㅋㅋ → ㅋㅋ)",
                                    default: true,
                                },
                                removeEmoticons: {
                                    type: "boolean",
                                    description: "Remove emoticons",
                                    default: true,
                                },
                                fixTypos: {
                                    type: "boolean",
                                    description: "Fix common typos",
                                    default: false,
                                },
                            },
                        },
                        async: {
                            type: "boolean",
                            description: "Async mode (return job ID immediately)",
                            default: false,
                        },
                    },
                },
                TranslateResponse: {
                    type: "object",
                    properties: {
                        success: {
                            type: "boolean",
                            example: true,
                        },
                        data: {
                            type: "object",
                            properties: {
                                jobId: {
                                    type: "string",
                                    format: "uuid",
                                    example: "123e4567-e89b-12d3-a456-426614174000",
                                },
                                original: {
                                    type: "string",
                                    example: "안녕하세요",
                                },
                                preprocessed: {
                                    type: "string",
                                    example: "안녕하세요",
                                },
                                translations: {
                                    type: "object",
                                    additionalProperties: {
                                        type: "string",
                                    },
                                    example: {
                                        en: "Hello",
                                        "zh-CN": "你好",
                                    },
                                },
                                detectedLanguage: {
                                    type: "string",
                                    example: "ko",
                                },
                                timing: {
                                    type: "object",
                                    properties: {
                                        preprocessing: {
                                            type: "number",
                                            description: "Preprocessing time in ms",
                                            example: 7,
                                        },
                                        languageDetection: {
                                            type: "number",
                                            description: "Language detection time in ms",
                                            example: 15,
                                        },
                                        translation: {
                                            type: "number",
                                            description: "Translation time in ms",
                                            example: 850,
                                        },
                                        total: {
                                            type: "number",
                                            description: "Total time in ms",
                                            example: 872,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                AsyncResponse: {
                    type: "object",
                    properties: {
                        success: {
                            type: "boolean",
                            example: true,
                        },
                        jobId: {
                            type: "string",
                            format: "uuid",
                            example: "123e4567-e89b-12d3-a456-426614174000",
                        },
                        message: {
                            type: "string",
                            example: "Translation job queued",
                        },
                    },
                },
                JobStatusResponse: {
                    type: "object",
                    properties: {
                        success: {
                            type: "boolean",
                            example: true,
                        },
                        status: {
                            type: "string",
                            enum: ["waiting", "active", "completed", "failed"],
                            example: "completed",
                        },
                        data: {
                            type: "object",
                            description: "Available when status is completed",
                        },
                        progress: {
                            type: "number",
                            description: "Progress percentage (0-100)",
                            example: 100,
                        },
                        error: {
                            type: "string",
                            description: "Error message when status is failed",
                        },
                    },
                },
                SpellCheckRequest: {
                    type: "object",
                    required: ["text"],
                    properties: {
                        text: {
                            type: "string",
                            description: "Text to check",
                            minLength: 1,
                            maxLength: 5000,
                            example: "안녕하세요",
                        },
                    },
                },
                SpellCheckResponse: {
                    type: "object",
                    properties: {
                        success: {
                            type: "boolean",
                            example: true,
                        },
                        data: {
                            type: "object",
                            properties: {
                                hasErrors: {
                                    type: "boolean",
                                    example: false,
                                },
                                errors: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            word: {
                                                type: "string",
                                                example: "안녕",
                                            },
                                            index: {
                                                type: "number",
                                                example: 0,
                                            },
                                            suggestions: {
                                                type: "array",
                                                items: {
                                                    type: "string",
                                                },
                                                example: ["안녕"],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        meta: {
                            type: "object",
                            properties: {
                                duration: {
                                    type: "number",
                                    description: "Processing time in ms",
                                    example: 5,
                                },
                            },
                        },
                    },
                },
                HealthResponse: {
                    type: "object",
                    properties: {
                        success: {
                            type: "boolean",
                            example: true,
                        },
                        status: {
                            type: "string",
                            example: "healthy",
                        },
                        queue: {
                            type: "object",
                            properties: {
                                waiting: {
                                    type: "number",
                                    example: 0,
                                },
                                active: {
                                    type: "number",
                                    example: 2,
                                },
                                completed: {
                                    type: "number",
                                    example: 150,
                                },
                                failed: {
                                    type: "number",
                                    example: 3,
                                },
                            },
                        },
                        spellChecker: {
                            type: "string",
                            enum: ["ready", "initializing"],
                            example: "ready",
                        },
                        timestamp: {
                            type: "number",
                            example: 1699999999999,
                        },
                    },
                },
                ErrorResponse: {
                    type: "object",
                    properties: {
                        success: {
                            type: "boolean",
                            example: false,
                        },
                        error: {
                            type: "string",
                            example: "Validation error",
                        },
                        details: {
                            type: "array",
                            items: {
                                type: "object",
                            },
                        },
                    },
                },
                // WebSocket message schemas
                WsTranslateMessage: {
                    type: "object",
                    required: ["type", "text", "targetLanguages"],
                    properties: {
                        type: {
                            type: "string",
                            enum: ["translate"],
                            example: "translate",
                        },
                        text: {
                            type: "string",
                            minLength: 1,
                            maxLength: 5000,
                            example: "안녕하세요",
                        },
                        targetLanguages: {
                            type: "array",
                            minItems: 1,
                            maxItems: 10,
                            items: {
                                type: "string",
                            },
                            example: ["en", "th", "zh-CN", "zh-TW"],
                        },
                        options: {
                            type: "object",
                            properties: {
                                expandAbbreviations: {
                                    type: "boolean",
                                    default: true,
                                },
                                filterProfanity: {
                                    type: "boolean",
                                    default: false,
                                },
                                normalizeRepeats: {
                                    type: "boolean",
                                    default: true,
                                },
                                removeEmoticons: {
                                    type: "boolean",
                                    default: true,
                                },
                                fixTypos: {
                                    type: "boolean",
                                    default: false,
                                },
                            },
                        },
                    },
                },
                WsPingMessage: {
                    type: "object",
                    required: ["type"],
                    properties: {
                        type: {
                            type: "string",
                            enum: ["ping"],
                            example: "ping",
                        },
                    },
                },
                WsConnectedMessage: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["connected"],
                            example: "connected",
                        },
                        clientId: {
                            type: "string",
                            format: "uuid",
                            example: "123e4567-e89b-12d3-a456-426614174000",
                        },
                        message: {
                            type: "string",
                            example: "Connected to translation service",
                        },
                    },
                },
                WsQueuedMessage: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["queued"],
                            example: "queued",
                        },
                        jobId: {
                            type: "string",
                            format: "uuid",
                            example: "123e4567-e89b-12d3-a456-426614174000",
                        },
                    },
                },
                WsResultMessage: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["result"],
                            example: "result",
                        },
                        jobId: {
                            type: "string",
                            format: "uuid",
                            example: "123e4567-e89b-12d3-a456-426614174000",
                        },
                        data: {
                            type: "object",
                            properties: {
                                jobId: {
                                    type: "string",
                                    format: "uuid",
                                },
                                original: {
                                    type: "string",
                                    example: "안녕하세요",
                                },
                                preprocessed: {
                                    type: "string",
                                    example: "안녕하세요",
                                },
                                translations: {
                                    type: "object",
                                    additionalProperties: {
                                        type: "string",
                                    },
                                    example: {
                                        en: "Hello",
                                    },
                                },
                                detectedLanguage: {
                                    type: "string",
                                    example: "ko",
                                },
                                timing: {
                                    type: "object",
                                    properties: {
                                        preprocessing: { type: "number", example: 7 },
                                        languageDetection: { type: "number", example: 15 },
                                        translation: { type: "number", example: 850 },
                                        total: { type: "number", example: 872 },
                                    },
                                },
                            },
                        },
                    },
                },
                WsPongMessage: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["pong"],
                            example: "pong",
                        },
                    },
                },
                WsErrorMessage: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["error"],
                            example: "error",
                        },
                        jobId: {
                            type: "string",
                            format: "uuid",
                        },
                        error: {
                            type: "string",
                            example: "Translation failed or timeout",
                        },
                        details: {
                            type: "array",
                            items: {
                                type: "object",
                            },
                        },
                    },
                },
            },
        },
    },
    apis: ["./src/routes/*.ts"],
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)(options);
//# sourceMappingURL=swagger.js.map