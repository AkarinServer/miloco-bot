import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { z } from "zod";
import { MilocoClient } from "./miloco_client.js";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());
const port = Number(process.env.PORT) || 3000;
const mcpApiKey = process.env.MCP_API_KEY;

// Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Allowed User IDs Logic
const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS || "";
const allowedUserIds = allowedUserIdsStr
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

bot.use(async (ctx, next) => {
  // Check if we have a user sender
  if (!ctx.from) {
    return next();
  }

  const userId = ctx.from.id.toString();
  const validIds = new Set(allowedUserIds);

  if (validIds.size > 0) {
      if (!validIds.has(userId)) {
          // Deny
          console.log(`[Access Denied] User ${userId} (${ctx.from.first_name}) is not in allowed list.`);
          return; // Stop processing, no reply
      }
  }

  return next();
});

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
      chat_id: z.string().optional().describe("The Telegram chat ID to send to. Leave empty (or omit) to broadcast to ALL allowed users."),
    },
  },
  async ({ message, chat_id }) => {
    let targetChatId = chat_id;
    // Handle "default" string explicitly to be robust for LLMs
    if (targetChatId === "default") {
      targetChatId = undefined;
    }
    
    if (targetChatId) {
        // Send to specific chat_id
        try {
            await bot.telegram.sendMessage(targetChatId, message);
            return {
                content: [{ type: "text", text: `Message sent to ${targetChatId}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to send message to ${targetChatId}: ${error.message}` }],
                isError: true,
            };
        }
    } else {
        // Broadcast to all allowed users
        if (allowedUserIds.length === 0) {
             return {
                content: [{ type: "text", text: "Error: No allowed users configured to broadcast to." }],
                isError: true,
            };
        }

        const results = await Promise.all(allowedUserIds.map(async (id) => {
            try {
                await bot.telegram.sendMessage(id, message);
                return { id, success: true };
            } catch (error: any) {
                console.error(`Failed to send to ${id}:`, error);
                return { id, success: false, error: error.message };
            }
        }));

        const successCount = results.filter(r => r.success).length;
        const failures = results.filter(r => !r.success).map(r => `${r.id} (${r.error})`);
        
        let resultText = `Message broadcasted to ${successCount}/${allowedUserIds.length} users.`;
        if (failures.length > 0) {
            resultText += ` Failures: ${failures.join(", ")}`;
        }

        return {
            content: [{ type: "text", text: resultText }],
            isError: failures.length === allowedUserIds.length // Error if all failed
        };
    }
  }
);

// Tool: Send photo to Telegram
server.registerTool(
  "send_telegram_photo",
  {
    description: "Send the latest photo/image from the vision_understand cache to a Telegram chat.",
    inputSchema: z.object({
        chat_id: z.string().optional().describe("The Telegram chat ID to send to. Leave empty (or omit) to broadcast to ALL allowed users."),
    }),
  },
  async ({ chat_id } = {}) => {
    let targetChatId = chat_id;
    if (targetChatId === "default") targetChatId = undefined;

    // Common logic to find image (moved out or duplicated for now, better to keep inside to avoid scope issues)
    // Helper function to find the data directory
    const findDataDir = () => {
        if (process.env.MILOCO_DATA_DIR && fs.existsSync(process.env.MILOCO_DATA_DIR)) {
            return process.env.MILOCO_DATA_DIR;
        }
        const os = require("os");
        const candidates = [
            path.join(os.homedir(), "miloco/data/images"),
            "/home/ubuntu/miloco/data/images",
        ];
        if (fs.existsSync("/home")) {
            try {
                const users = fs.readdirSync("/home");
                for (const user of users) {
                    const p = path.join("/home", user, "miloco/data/images");
                    if (!candidates.includes(p)) candidates.push(p);
                }
            } catch (e) { console.error("Failed to scan /home:", e); }
        }
        for (const c of candidates) {
            if (fs.existsSync(c)) return c;
        }
        return path.join(os.homedir(), "miloco/data/images");
    };

    const baseDir = findDataDir();
    if (!fs.existsSync(baseDir)) {
        return { content: [{ type: "text", text: `Error: Cache base directory (${baseDir}) does not exist.` }], isError: true };
    }

    const date = new Date();
    date.setHours(date.getHours() + 8);
    const year = date.getUTCFullYear().toString().slice(2);
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const dateDir = path.join(baseDir, dateStr);
    
    if (!fs.existsSync(dateDir)) {
        return { content: [{ type: "text", text: `Error: Cache directory for today (${dateDir}) does not exist.` }], isError: true };
    }

    const files = fs.readdirSync(dateDir)
        .filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'))
        .map(f => ({ name: f, time: fs.statSync(path.join(dateDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
    
    if (files.length === 0 || !files[0]) {
        return { content: [{ type: "text", text: `Error: No images found in cache directory ${dateDir}` }], isError: true };
    }

    const latestFile = path.join(dateDir, files[0].name);
    const photoArg = { source: latestFile };

    // Send logic
    if (targetChatId) {
        try {
            await bot.telegram.sendPhoto(targetChatId, photoArg);
            return {
                content: [{ type: "text", text: `Latest photo sent to ${targetChatId}: ${files[0].name}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to send photo to ${targetChatId}: ${error.message}` }],
                isError: true,
            };
        }
    } else {
        // Broadcast
        if (allowedUserIds.length === 0) {
             return {
                content: [{ type: "text", text: "Error: No allowed users configured to broadcast to." }],
                isError: true,
            };
        }

        const results = await Promise.all(allowedUserIds.map(async (id) => {
            try {
                await bot.telegram.sendPhoto(id, photoArg);
                return { id, success: true };
            } catch (error: any) {
                console.error(`Failed to send photo to ${id}:`, error);
                return { id, success: false, error: error.message };
            }
        }));

        const successCount = results.filter(r => r.success).length;
        const failures = results.filter(r => !r.success).map(r => `${r.id} (${r.error})`);
        
        let resultText = `Photo broadcasted to ${successCount}/${allowedUserIds.length} users. File: ${files[0].name}`;
        if (failures.length > 0) {
            resultText += ` Failures: ${failures.join(", ")}`;
        }

        return {
            content: [{ type: "text", text: resultText }],
            isError: failures.length === allowedUserIds.length
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

// --- Command Handlers ---

bot.command("help", async (ctx) => {
  const message = `
🤖 *Miloco Bot Commands*

/help - Show this list of commands
/rules - Manage trigger rules
/status - Check connection status
/ping - Test bot responsiveness
  `;
  // Using Markdown for better formatting
  await ctx.replyWithMarkdown(message);
});

bot.command("rules", async (ctx) => {
    try {
        if (!milocoClient.isLoggedin) {
            await ctx.reply("Please login first by sending the password.");
            return;
        }
        const rules = await milocoClient.getRules();
        if (rules.length === 0) {
            await ctx.reply("No rules found.");
            return;
        }
        
        const keyboard = rules.map((rule: any) => {
            const statusEmoji = rule.enabled ? "✅" : "❌";
            return [{
                text: `${statusEmoji} ${rule.name}`,
                callback_data: `toggle_rule:${rule.id}`
            }];
        });
        
        await ctx.reply("Trigger Rules (Click to toggle):", {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (err: any) {
        await ctx.reply(`Failed to load rules: ${err.message}`);
    }
});

bot.action(/toggle_rule:(.+)/, async (ctx) => {
    const ruleId = ctx.match[1];
    if (!ruleId) return;
    try {
        const rules = await milocoClient.getRules();
        const rule = rules.find((r: any) => r.id === ruleId);
        
        if (!rule) {
            await ctx.answerCbQuery("Rule not found");
            return;
        }
        
        const newStatus = !rule.enabled;
        await milocoClient.toggleRule(ruleId, newStatus);
        
        // Refresh list
        const updatedRules = await milocoClient.getRules();
        const keyboard = updatedRules.map((r: any) => {
            const statusEmoji = r.enabled ? "✅" : "❌";
            return [{
                text: `${statusEmoji} ${r.name}`,
                callback_data: `toggle_rule:${r.id}`
            }];
        });
        
        await ctx.editMessageReplyMarkup({
             inline_keyboard: keyboard
        });
        
        await ctx.answerCbQuery(`Rule "${rule.name}" ${newStatus ? 'enabled' : 'disabled'}`);
        
    } catch (err: any) {
        console.error("Toggle failed", err);
        await ctx.answerCbQuery(`Failed: ${err.message}`);
    }
});

// Tool: List rules
server.registerTool(
  "list_rules",
  {
    description: "List all trigger rules with their status",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const rules = await milocoClient.getRules();
      return {
        content: [{ type: "text", text: JSON.stringify(rules, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Failed to list rules: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Tool: Toggle rule
server.registerTool(
  "toggle_rule",
  {
    description: "Enable or disable a trigger rule",
    inputSchema: z.object({
      rule_id: z.string().describe("The ID of the rule to toggle"),
      enabled: z.boolean().describe("True to enable, False to disable"),
    }),
  },
  async ({ rule_id, enabled }) => {
    try {
      await milocoClient.toggleRule(rule_id, enabled);
      return {
        content: [{ type: "text", text: `Rule ${rule_id} ${enabled ? 'enabled' : 'disabled'}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Failed to toggle rule: ${error.message}` }],
        isError: true,
      };
    }
  }
);

bot.command("status", async (ctx) => {
    const status = milocoClient.isLoggedin ? "✅ Logged In" : "❌ Not Logged In";
    await ctx.reply(`Bot Status: ${status}\nMCPServer: Running`);
});

bot.command("ping", async (ctx) => {
    await ctx.reply("Pong! 🏓");
});

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

    // Set Telegram commands menu
    try {
        await bot.telegram.setMyCommands([
            { command: "rules", description: "Show list of commands" },
            { command: "status", description: "Check connection status" },
            { command: "ping", description: "Test bot responsiveness" }
        ]);
        console.log("Telegram commands menu updated");
    } catch (err) {
        console.error("Failed to set Telegram commands:", err);
    }

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
