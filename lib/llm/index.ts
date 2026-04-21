import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { XAIProvider } from "./xai";

export type ProviderName = "anthropic" | "openai" | "google" | "xai" | "station_proxy";

/**
 * Returns a provider instance initialized with the given credential.
 * Credential must come from resolveAccount() — never from process.env directly.
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
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export type { Chunk, LLMProvider } from "./types";
