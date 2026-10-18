import z from "@deepseek-ai/schemastery";
import { Context, Volatile } from "@deepseek-ai/cordis";
//#region src/contract.d.ts
declare const PROVIDER = "codebuddy";
/** 提示缓存保留时长偏好：default 不指定，1h 在请求体加 cache_retention: "long"。 */
declare const CACHE_RETENTIONS: readonly ["default", "1h"];
type CacheRetention = typeof CACHE_RETENTIONS[number];
//#endregion
//#region src/index.d.ts
declare const name = "llm-codebuddy";
declare const inject: string[];
declare const CREDENTIAL_REF: import("@deepseek-ai/dsh-credentials").CredentialRef;
declare const Config: z<Schemastery.ObjectS<NoInfer<{
  defaultSite: z<string, string, "volatile-defined">;
  cacheRetention: z<"default" | "1h", "default" | "1h", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
  defaultSite: z<string, string, "volatile-defined">;
  cacheRetention: z<"default" | "1h", "default" | "1h", "volatile-defined">;
}>>, "plain">;
declare function apply(ctx: Context, config?: {
  defaultSite: Volatile<string>;
  cacheRetention?: Volatile<CacheRetention>;
}): void;
//#endregion
export { CREDENTIAL_REF, Config, PROVIDER, apply, inject, name };