// Minimal ambient declarations for the node/bun built-ins the bench CLI uses.
//
// `@types/node` is deliberately NOT a dependency of @almamesh/llm (the package
// is browser-targeted), and the bench harness must not add runtime or type
// dependencies to the package. This shim declares ONLY the surface the bench
// actually touches; the code runs under bun, which provides the real modules.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function resolve(...parts: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

// The bench runs under bun/node; `process` exists at runtime.
declare const process: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  exit(code?: number): never;
  cwd(): string;
};
