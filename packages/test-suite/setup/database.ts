import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@DarkAuth/api/src/db/schema.ts';
import path from 'path';
import { fileURLToPath } from 'url';

export async function createTestDatabase(): Promise<string> {
  const dbName = `darkauth_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  let systemClient: Pool;
  
  if (process.env.DATABASE_URL) {
    // Use DATABASE_URL if provided
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres'; // Connect to postgres system database
    systemClient = new Pool({ connectionString: url.toString() });
  } else {
    // Connect to postgres system database to create test database
    const config: any = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: 'postgres',
      user: process.env.POSTGRES_USER || 'DarkAuth',
      password: process.env.POSTGRES_PASSWORD || 'DarkAuth_password'
    };
    
    systemClient = new Pool(config);
  }
  
  try {
    await systemClient.query(`CREATE DATABASE "${dbName}"`);
    // Database created
    
    // Now run migrations on the new database
    await runMigrations(dbName);
    // Migrations completed
    
    return dbName;
  } finally {
    await systemClient.end();
  }
}

export async function destroyTestDatabase(dbName: string): Promise<void> {
  let systemClient: Pool;
  
  if (process.env.DATABASE_URL) {
    // Use DATABASE_URL if provided
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres'; // Connect to postgres system database
    systemClient = new Pool({ connectionString: url.toString() });
  } else {
    // Connect to postgres system database to create test database
    const config: any = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: 'postgres',
      user: process.env.POSTGRES_USER || 'DarkAuth',
      password: process.env.POSTGRES_PASSWORD || 'DarkAuth_password'
    };
    
    systemClient = new Pool(config);
  }
  
  try {
    // Terminate any active connections to the database
    await systemClient.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid != pg_backend_pid()
    `, [dbName]);
    
    await systemClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    // Database destroyed
  } finally {
    await systemClient.end();
  }
}

export function getTestDatabaseUri(dbName: string): string {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER || 'DarkAuth';
  const password = process.env.POSTGRES_PASSWORD || 'DarkAuth_password';
  
  return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
}

async function runMigrations(dbName: string): Promise<void> {
  // Use drizzle-kit push to create schema from the Drizzle definitions
  const connectionString = getTestDatabaseUri(dbName);
  
  try {
    // Import drizzle-kit's push functionality
    const { execSync } = await import('child_process');
    
    // Set the database URL for this specific test database
    const env = { 
      ...process.env, 
      DATABASE_URL: connectionString,
      NODE_ENV: 'test'
    };
    
    // Run drizzle-kit push from the api directory where drizzle.config.ts is located
    const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/api');
    
    execSync('npx drizzle-kit push', { 
      env,
      cwd,
      stdio: 'pipe' // Don't spam the console with multiple parallel outputs
    });
    
    // Schema pushed
    
    // Verify the schema was created by checking if settings table exists
    const pool = new Pool({ connectionString });
    try {
      await pool.query("SELECT 1 FROM settings LIMIT 1");
      // Schema verified
    } catch (verifyError) {
      // If settings table doesn't exist, wait a bit and retry once
      // Schema verification failed, retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      await pool.query("SELECT 1 FROM settings LIMIT 1");
      // Schema verified on retry
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error(`Schema push failed for ${dbName}:`, error);
    throw error;
  }
}