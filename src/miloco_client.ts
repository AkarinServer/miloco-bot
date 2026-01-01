import WebSocket from "ws";
import { randomUUID, createHash } from "crypto";
import https from "https";
import { IncomingMessage } from "http";


export interface MilocoMessage {
  type: "text";
  content: string;
}

export interface MilocoClientOptions {
  onMessage: (chatId: string, message: string, isFinal: boolean) => void;
}

export class MilocoClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingRequests = new Map<string, { chatId: string; response: string; lastUpdate: number }>();
  private options: MilocoClientOptions;
  private token: string | null = null;
  private sessionIds = new Map<string, string>();

  public isLoggedin = false;

  constructor(options: MilocoClientOptions) {
    this.options = options;
  }

  private getSessionId(chatId: string): string {
    if (!this.sessionIds.has(chatId)) {
        // Use timestamp to ensure fresh session on bot restart/reconnect
        // This avoids stuck sessions with invalid history state
        this.sessionIds.set(chatId, `telegram_${chatId}_${Date.now()}`);
    }
    return this.sessionIds.get(chatId)!;
  }

  public resetSession(chatId: string) {
      this.sessionIds.delete(chatId);
  }


  public async connect(): Promise<void> {
    // This method is now only used to ensure we have a valid token/login
    console.log("MilocoClient: connect() called (token check)");
    const ACCESS_TOKEN = process.env.MILOCO_ACCESS_TOKEN;
    
    if (this.token) {
        return Promise.resolve();
    }

    try {
        if (ACCESS_TOKEN) {
          console.log("Using provided access token from environment");
          this.token = ACCESS_TOKEN;
          this.isLoggedin = true;
        } else {
          // Try to login with env password if available
          const envPassword = process.env.MILOCO_PASSWORD;
          if (envPassword) {
             console.log("Logging in to Miloco using env password...");
             this.token = await this.login(envPassword);
             this.isLoggedin = true;
             console.log("Login successful");
          } else {
             console.log("No token or password available. Waiting for manual login.");
             return Promise.resolve();
          }
        }
    } catch (err) {
      console.error("Login failed:", err);
      return Promise.resolve();
    }
  }

  // Remove scheduleReconnect as we are moving to per-request connections
  private scheduleReconnect() {}

  public async login(password: string): Promise<string> {
    const ADMIN_USERNAME = process.env.MILOCO_ADMIN_USERNAME || "admin";
    const MILOCO_WS_URL = process.env.MILOCO_WS_URL || "ws://localhost:8000/chat/ws/query";

    return new Promise((resolve, reject) => {
      const passwordMd5 = createHash("md5").update(password).digest("hex");
      const postData = JSON.stringify({
        username: ADMIN_USERNAME,
        password: passwordMd5
      });

      // Construct login URL from WS URL
      // ws://localhost:8000/chat/ws/query -> https://localhost:8000/api/auth/login
      const wsUrlObj = new URL(MILOCO_WS_URL);
      // Determine protocol for login (https if wss, http if ws)
      // But user might use wss for local with self-signed, so we should use https
      // If original was ws, use http
      const protocol = wsUrlObj.protocol === 'wss:' ? 'https:' : 'http:';
      const loginUrl = `${protocol}//${wsUrlObj.host}/api/auth/login`;

      const requestModule = protocol === 'https:' ? https : require('http');

      const req = requestModule.request(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        rejectUnauthorized: false
      }, (res: IncomingMessage) => {
        // Extract cookie from headers
        let token: string | null = null;
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            for (const cookie of setCookie) {
                if (cookie && cookie.startsWith('access_token=')) {
                     const firstPart = cookie.split(';')[0];
                     if (firstPart) {
                         const parts = firstPart.split('=');
                         if (parts.length > 1 && parts[1]) {
                             token = parts[1];
                         }
                     }
                }
            }
        }

        if (res.statusCode !== 200) {
          // Consume response data to free memory
          res.resume();
          reject(new Error(`Login failed with status code: ${res.statusCode}`));
          return;
        }

        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
            if (token) {
                this.token = token;
                resolve(token);
                return;
            }

            try {
                const response = JSON.parse(responseData);
                if (response.access_token) {
                    this.token = response.access_token;
                    resolve(response.access_token);
                } else if (response.token) {
                    this.token = response.token;
                    resolve(response.token);
                } else {
                    reject(new Error("No access_token in response headers or body"));
                }
            } catch (e) {
                reject(e);
            }
        });
      });

      req.on('error', (e: Error) => {
        reject(e);
      });

      req.write(postData);
      req.end();
    });
  }

  public async sendQuery(chatId: string, query: string) {
    if (!this.token) {
      throw new Error("Not logged in");
    }

    const MILOCO_WS_URL = process.env.MILOCO_WS_URL || "ws://localhost:8000/api/chat/ws/query";
          const requestId = randomUUID();
          const sessionId = this.getSessionId(chatId);
          const url = `${MILOCO_WS_URL}?request_id=${requestId}&session_id=${sessionId}`;

          // Construct valid Origin
          const wsUrlObj = new URL(MILOCO_WS_URL);
          const originProtocol = wsUrlObj.protocol === 'wss:' ? 'https:' : 'http:';
          const origin = `${originProtocol}//${wsUrlObj.host}`;

          console.log(`Connecting to Miloco WebSocket at ${url} for chat ${chatId}`);
          console.log(`Using Origin: ${origin}`);
          console.log(`Token prefix: ${this.token?.substring(0, 5)}...`);

          const headers = {
            Cookie: `access_token=${this.token}`,
            Origin: origin,
          };

          return new Promise<void>((resolve, reject) => {
              const ws = new WebSocket(url, { 
                  headers,
                  rejectUnauthorized: false 
              });

              let responseAccumulator = "";

              ws.on("open", () => {
                  console.log(`Connected to Miloco WebSocket for chat ${chatId}`);
                  
                  const payload = {
                      query: query,
                      mcp_list: ["MIoT Automation", "MIoT Device Control"],
                      camera_ids: [],
                  };
        
            const event = {
                header: {
                type: "event",
                namespace: "Nlp",
                name: "Request",
                timestamp: Date.now(),
                request_id: requestId,
                session_id: sessionId,
                },
                payload: JSON.stringify(payload),
            };
        
            ws.send(JSON.stringify(event));
        });

        ws.on("message", (data: WebSocket.Data) => {
            try {
                const messageStr = data.toString();
                console.log("Received WebSocket message:", messageStr);
                const message = JSON.parse(messageStr);
                const { header, payload } = message;
                
                if (!header) return;

                if (header.type === "instruction" && header.namespace === "Template" && header.name === "ToastStream") {
                    const content = JSON.parse(payload);
                    if (content.stream) {
                        responseAccumulator += content.stream;
                        // Optionally send streaming updates to Telegram (careful with rate limits)
                    }
                } else if (header.type === "instruction" && header.namespace === "Dialog" && header.name === "Finish") {
                    console.log(`Received Dialog.Finish. Full response length: ${responseAccumulator.length}`);
                    
                    // Check if response ends with reflection, implying incomplete output
                    if (responseAccumulator.trim().endsWith("</reflect>")) {
                         responseAccumulator += "\n\n(System: No final response received from Miloco backend)";
                    }

                    this.options.onMessage(chatId, responseAccumulator, true);
                    
                    // Small delay before closing to ensure any pending frames are processed
                    setTimeout(() => {
                        ws.close();
                        resolve();
                    }, 500);
                } else if (header.type === "instruction" && header.namespace === "Dialog" && header.name === "Exception") {
                    const content = JSON.parse(payload);
                    const errorMsg = `Error: ${content.message}`;
                    // If error indicates invalid history state, reset session for next time
                    if (content.message && content.message.includes("tool_calls")) {
                        console.log(`Resetting session for chat ${chatId} due to tool_calls error`);
                        this.resetSession(chatId);
                    }
                    this.options.onMessage(chatId, errorMsg, true);
                    ws.close();
                    resolve(); // Resolve even on error to avoid hanging, message sent via callback
                } else {
                    // Handle other instructions (like Confirmation.SaveRuleConfirm or ToolCall)
                     console.log(`Unhandled instruction: ${header.namespace}.${header.name}`);
                     
                     if (header.namespace === "Confirmation" && header.name === "SaveRuleConfirm") {
                         try {
                             const content = JSON.parse(payload);
                             const rule = content.rule;
                             let msg = `Miloco suggests creating an automation rule:\n\n`;
                             msg += `Name: ${rule.name}\n`;
                             msg += `Condition: ${rule.condition}\n`;
                             if (rule.execute_info && rule.execute_info.ai_recommend_action_descriptions) {
                                 msg += `Actions: ${rule.execute_info.ai_recommend_action_descriptions.join(", ")}\n`;
                             }
                             msg += `\n(Note: Interactive confirmation is not yet supported via Telegram)`;
                             this.options.onMessage(chatId, msg, true);
                         } catch (e) {
                             this.options.onMessage(chatId, `Received SaveRuleConfirm but failed to parse: ${e}`, true);
                         }
                         ws.close();
                         resolve();
                         return;
                     }

                     // Try to parse payload for better debug info
                    let debugInfo = "";
                    try {
                        const parsedPayload = JSON.parse(payload);
                        debugInfo = JSON.stringify(parsedPayload, null, 2);
                    } catch (e) {
                        debugInfo = payload;
                    }

                    // For now, inform the user about the unhandled instruction so they know something happened
                    // But only for "interesting" ones to avoid noise
                    if (header.namespace === "Confirmation" || header.namespace === "Dialog") {
                         this.options.onMessage(chatId, `Received unhandled instruction: ${header.namespace}.${header.name}\n\n${debugInfo}`, true);
                         ws.close();
                         resolve();
                    }
                }
            } catch (err) {
                console.error("Error handling message:", err);
            }
        });

        ws.on("close", (code, reason) => {
            console.log(`Miloco WebSocket disconnected for chat ${chatId}. Code: ${code}, Reason: ${reason.toString()}`);
            resolve();
        });

        ws.on("error", (err) => {
            console.error(`Miloco WebSocket error for chat ${chatId}:`, err);
            reject(err);
        });
    });
  }

  private handleMessage(data: WebSocket.Data) {
      // Deprecated in favor of per-request handler
  }
}
