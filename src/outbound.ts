import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import type { FeishuConfig } from "./types.js";
import { getFeishuRuntime } from "./runtime.js";
import { sendMessageFeishu, sendMarkdownCardFeishu } from "./send.js";
import { sendMediaFeishu } from "./media.js";

/**
 * Check if text contains code blocks or tables (triggers card mode in "auto")
 */
function hasRichContent(text: string): boolean {
  // Code blocks: ```...``` or indented code
  if (/```[\s\S]*?```/.test(text)) return true;
  // Tables: | col1 | col2 |
  if (/\|.+\|.+\|/.test(text)) return true;
  return false;
}

/**
 * Resolve whether to use card mode based on renderMode config and content
 */
function shouldUseCard(cfg: { channels?: { feishu?: FeishuConfig } }, text: string): boolean {
  const feishuCfg = cfg.channels?.feishu;
  const renderMode = feishuCfg?.renderMode ?? "auto";

  if (renderMode === "card") return true;
  if (renderMode === "raw") return false;
  // auto: use card if has rich content
  return hasRichContent(text);
}

export const feishuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getFeishuRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: async ({ cfg, to, text }) => {
    // Check renderMode to decide between card and regular message
    if (shouldUseCard(cfg, text)) {
      const result = await sendMarkdownCardFeishu({ cfg, to, text });
      return { channel: "feishu", ...result };
    }
    const result = await sendMessageFeishu({ cfg, to, text });
    return { channel: "feishu", ...result };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl }) => {
    // Send text first if provided
    if (text?.trim()) {
      // Use card mode for text with media if configured
      if (shouldUseCard(cfg, text)) {
        await sendMarkdownCardFeishu({ cfg, to, text });
      } else {
        await sendMessageFeishu({ cfg, to, text });
      }
    }

    // Upload and send media if URL provided
    if (mediaUrl) {
      try {
        const result = await sendMediaFeishu({ cfg, to, mediaUrl });
        return { channel: "feishu", ...result };
      } catch (err) {
        // Log the error for debugging
        console.error(`[feishu] sendMediaFeishu failed:`, err);
        // Fallback to URL link if upload fails
        const fallbackText = `📎 ${mediaUrl}`;
        const result = await sendMessageFeishu({ cfg, to, text: fallbackText });
        return { channel: "feishu", ...result };
      }
    }

    // No media URL, just return text result
    const result = await sendMessageFeishu({ cfg, to, text: text ?? "" });
    return { channel: "feishu", ...result };
  },
};
