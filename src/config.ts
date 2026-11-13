import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Raiz do projeto (pasta acima de src/), independente de onde o hook é chamado. */
export const ROOT = path.resolve(import.meta.dirname, "..");

export interface GuardConfig {
  /** Ferramentas do Claude Code que passam pelo Jev. */
  tools: string[];
  /** A partir deste risco (escala 0..3) o hook pede confirmação. */
  askAtRisk: number;
  /** A partir deste risco o hook bloqueia (só quando denyEnabled = true). */
  denyAtRisk: number;
  /** Probabilidade mínima para uma pergunta sim/não contar como "sim". */
  flagThreshold: number;
  /** Se false, o pior caso é "ask" (pedir confirmação). Se true, risco crítico é bloqueado. */
  denyEnabled: boolean;
  /** Timeout por tentativa da chamada ao Jev, em ms. */
  timeoutMs: number;
}

export const DEFAULT_CONFIG: GuardConfig = {
  tools: ["Bash", "PowerShell"],
  askAtRisk: 1.5,
  denyAtRisk: 2.5,
  flagThreshold: 0.8,
  denyEnabled: false,
  timeoutMs: 4000,
};

/** Lê guard.config.json da raiz e completa com os valores padrão. */
export function loadConfig(file = path.join(ROOT, "guard.config.json")): GuardConfig {
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<GuardConfig>;
  return { ...DEFAULT_CONFIG, ...raw };
}

/** Carrega o .env da raiz, se existir (o hook roda com o ambiente do Claude Code). */
export function loadEnv(file = path.join(ROOT, ".env")): void {
  if (existsSync(file)) process.loadEnvFile(file);
}
