import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { XAIProvider } from "./xai";
import { StationProxyProvider } from "./station-proxy";

export type ProviderName = "anthropic" | "openai" | "google" | "xai" | "deepseek" | "station_proxy";

/**
 * Returns a provider instance initialized with the given credential.
 * Credential must come from resolveAccount() — never from process.env directly.
 *
 * For station_proxy: credential is the NOUS API key (proxy x-api-key auth).
 * The proxy handles all sub-providers internally (Anthropic OAuth, OpenAI/Google/xAI/DeepSeek API keys).
 *
 * For deepseek: routes through station_proxy since we don't have a direct DeepSeek SDK.
 */
export function getProvider(name: ProviderName, credential: string): LLMProvider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(credential);
    case "openai":
      return new OpenAIProvider(credential);
    case "google":
      return new GoogleProvider(credential);
    case "xai":
      return new XAIProvider(credential);
    case "station_proxy":
      return new StationProxyProvider(credential);
    case "deepseek":
      // DeepSeek routes through station proxy — credential is NOUS API key
      return new StationProxyProvider(credential);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export type { Chunk, LLMProvider } from "./types";
