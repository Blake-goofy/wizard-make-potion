import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(options: { connectionString: string }) {
  const pool = new Pool({ connectionString: options.connectionString });

  return {
    query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
      return pool.query<T>(text, values);
    },

    async transaction<T>(callback: (client: PoolClient) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await callback(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async health() {
      try {
        await pool.query('select 1');
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : 'Database unavailable',
        };
      }
    },

    close() {
      return pool.end();
    },
  };
}
