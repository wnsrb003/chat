import { Server } from "http";
export declare class WebSocketService {
    private wss;
    private clients;
    constructor(server: Server);
    private setupWebSocketServer;
    private handleMessage;
    /**
     * 각 언어를 완전히 독립적으로 처리 (전처리 + 번역)
     */
    private processLanguageIndependentlyForWebSocket;
    broadcast(message: any): void;
    close(): void;
}
//# sourceMappingURL=websocket.service.d.ts.map