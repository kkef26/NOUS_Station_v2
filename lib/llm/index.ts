import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { XAIProvider } from "./xai";

export type ProviderName = "anthropic" | "openai" | "google" | "xai";

const cache = new Map<ProviderName, LLMProvider>();

export function getProvider(name: ProviderName): LLMProvider {
  const cached = cache.get(name);
  if (cached) return cached;

  let provider: LLMProvider;
  switch (name) {
    case "anthropic":
      provider = new AnthropicProvider();
      break;
    case "openai":
      provider = new OpenAIProvider();
      break;
    case "google":
      provider = new GoogleProvider();
      break;
    case "xai":
      provider = new XAIProvider();
      break;
    default:
      throw new Error(`Unknown provider: ${name}`);
  }

  cache.set(name, provider);
  return provider;
}

export type { Chunk, LLMProvider } from "./types";
