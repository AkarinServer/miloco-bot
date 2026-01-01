import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { z } from "zod";
import { MilocoClient } from "./miloco_client.js";

dotenv.config();

const app = express();
app.use(express.json());
const port = Number(process.env.PORT) || 3000;
const mcpApiKey = process.env.MCP_API_KEY;

// Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const defaultChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID;

// Initialize Miloco Client
const milocoClient = new MilocoClient({
  onMessage: async (chatId, message, isFinal) => {
    if (isFinal && message.trim()) {
      try {
        await bot.telegram.sendMessage(chatId, message);
      } catch (err) {
        console.error(`Failed to send response to ${chatId}:`, err);
      }
    }
  }
});

// Store recent messages for resource polling
let recentMessages: string[] = [];
const MAX_RECENT_MESSAGES = 10;

// Initialize MCP Server
const server = new McpServer({
  name: "miloco-bot",
  version: "1.0.0",
});

// --- MCP Tools ---

// Tool: Send message to Telegram
server.registerTool(
  "send_telegram_message",
  {
    description: "Send a text message to a Telegram user or group",
    inputSchema: {
      message: z.string().describe("The message text to send"),
      chat_id: z.string().optional().describe("The Telegram chat ID to send to. Leave empty (or omit) to use the configured default chat ID."),
    },
  },
  async ({ message, chat_id }) => {
    let targetChatId = chat_id;
    // Handle "default" string explicitly to be robust for LLMs
    if (targetChatId === "default") {
      targetChatId = undefined;
    }
    
    targetChatId = targetChatId || defaultChatId;
    
    if (!targetChatId) {
      return {
        content: [{ type: "text", text: "Error: No chat_id provided and no default configured." }],
        isError: true,
      };
    }

    try {
      await bot.telegram.sendMessage(targetChatId, message);
      return {
        content: [{ type: "text", text: `Message sent to ${targetChatId}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Failed to send message: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Tool: Send photo to Telegram
server.registerTool(
  "send_telegram_photo",
  {
    description: "Send a photo/image to a Telegram user or group",
    inputSchema: {
      photo: z.string().describe("The image URL to send"),
      caption: z.string().optional().describe("Optional caption for the photo"),
      chat_id: z.string().optional().describe("The Telegram chat ID to send to. Leave empty (or omit) to use the configured default chat ID."),
    },
  },
  async ({ photo, caption, chat_id }) => {
    let targetChatId = chat_id;
    if (targetChatId === "default") {
      targetChatId = undefined;
    }
    
    targetChatId = targetChatId || defaultChatId;
    
    if (!targetChatId) {
      return {
        content: [{ type: "text", text: "Error: No chat_id provided and no default configured." }],
        isError: true,
      };
    }

    try {
      // Ensure caption is treated as string | undefined compatible with Telegraf
      const extra = caption ? { caption } : {};
      await bot.telegram.sendPhoto(targetChatId, photo, extra);
      return {
        content: [{ type: "text", text: `Photo sent to ${targetChatId}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Failed to send photo: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// --- MCP Resources ---

// Resource: Get recent Telegram messages
server.registerResource(
  "recent_messages",
  "telegram://messages/recent",
  {
    description: "Get recent Telegram messages",
    mimeType: "application/json",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(recentMessages, null, 2),
        },
      ],
    };
  }
);

// --- Telegram Bot Logic ---

// Helper to add message and notify
async function addMessageAndNotify(message: string) {
  console.log("Received Telegram message:", message);
  
  // Update recent messages list
  recentMessages.unshift(message);
  if (recentMessages.length > MAX_RECENT_MESSAGES) {
    recentMessages.pop();
  }
  
  // Notify clients that the resource has been updated
  if (server.isConnected()) {
    server.server.sendResourceUpdated({ uri: "telegram://messages/recent" })
      .then(() => console.log("Sent resource updated notification for telegram://messages/recent"))
      .catch(err => console.error("Failed to send resource updated notification:", err));
  } else {
    console.log("No MCP client connected, skipping notification.");
  }
}

bot.on("text", async (ctx) => {
  // Check if MilocoClient is logged in
  if (!milocoClient.isLoggedin) {
    try {
      await ctx.reply("Attempting to login with provided password...");
      const password = ctx.message.text.trim();
      await milocoClient.login(password);
      milocoClient.isLoggedin = true;
      await milocoClient.connect();
      await ctx.reply("Login successful! You can now chat with Miloco.");
      return;
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      await ctx.reply(`Login failed: ${err.message}. Please try again.`);
      return;
    }
  }

  const message = `[${new Date().toISOString()}] ${ctx.from.first_name}: ${ctx.message.text}`;
  await addMessageAndNotify(message);

  // Forward to Miloco via WebSocket
  try {
    await milocoClient.sendQuery(ctx.chat.id.toString(), ctx.message.text);
  } catch (err) {
    console.error("Failed to send query to Miloco:", err);
    // Check if error is due to not being connected/logged in (e.g. token expired)
    if (!milocoClient.isLoggedin) {
       await ctx.reply("Not logged in. Please enter your password.");
    } else {
       await ctx.reply("Failed to send message to Miloco. Check logs.");
    }
  }
});

bot.on("photo", async (ctx) => {
  try {
    const message = ctx.message as any;
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      const photo = message.photo[message.photo.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const caption = message.caption ? ` (Caption: ${message.caption})` : "";
      const logMessage = `[${new Date().toISOString()}] ${ctx.from.first_name}: [Photo]${caption} ${fileLink.href}`;
      await addMessageAndNotify(logMessage);
      
      // We could also send photo info to Miloco if Nlp.Request supported it, 
      // but currently it only supports 'query' string. 
      // We can append the photo URL to the query.
      const query = message.caption ? `${message.caption} [Image: ${fileLink.href}]` : `[Image: ${fileLink.href}]`;
      await milocoClient.sendQuery(ctx.chat.id.toString(), query);
    }
  } catch (err) {
    console.error("Failed to process photo message:", err);
  }
});

// --- Express Server for MCP Streamable HTTP ---

const transport = new StreamableHTTPServerTransport();

app.all("/mcp", async (req, res) => {
  // Bearer Token Auth
  const authHeader = req.headers.authorization;
  if (mcpApiKey && (!authHeader || authHeader !== `Bearer ${mcpApiKey}`)) {
      res.status(401).send("Unauthorized");
      return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function main() {
    // Initialize transport
    await server.connect(transport as any);

    // Connect to Miloco WebSocket
    milocoClient.connect();

    // Start Express first (bind to 0.0.0.0)
    const httpServer = app.listen(port, "0.0.0.0", () => {
        console.log(`MCP Server running on port ${port}`);
    });

    // Launch Bot
    console.log("Starting Telegram bot...");
    // Don't await launch if it blocks, but usually it shouldn't block indefinitely. 
    // However, to be safe, we can just launch it.
    bot.launch().then(() => {
        console.log("Telegram bot started");
    }).catch(err => {
        console.error("Failed to launch Telegram bot:", err);
    });

    // Graceful stop
    const shutdown = (signal: string) => {
        console.log(`Received ${signal}, shutting down...`);
        bot.stop(signal);
        httpServer.close(() => {
            console.log("HTTP server closed");
            process.exit(0);
        });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(console.error);
