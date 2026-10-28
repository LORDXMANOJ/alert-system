/** Anything that can run SQL: the database itself or an open transaction. */
export type Q = {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};
