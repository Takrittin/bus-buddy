import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.isDatabaseReachable();
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.logger.warn(
          'Postgres is unavailable during startup. Database-backed features will stay unavailable until the database comes back online.',
        );
        return;
      }

      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  async isDatabaseReachable() {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      if (this.isConnectionError(error)) {
        return false;
      }

      throw error;
    }
  }

  isConnectionError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    const code = 'code' in error ? error.code : undefined;
    return (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'EPERM' ||
      code === 'P1001' ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('connect EPERM')
    );
  }
}
