export type SqlStatement = {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
};

export type MoteDatabase = {
  prepare(sql: string): SqlStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  close(): void;
};
