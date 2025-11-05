import { Server } from "http";
export declare class WebSocketService {
    private wss;
    private clients;
    constructor(server: Server);
    private setupWebSocketServer;
    private handleMessage;
    broadcast(message: any): void;
    close(): void;
}
//# sourceMappingURL=websocket.service.d.ts.map