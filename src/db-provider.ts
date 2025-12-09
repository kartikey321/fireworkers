import { init } from './init.js';
import type * as Firestore from './types.js';

/**
 * Singleton class for managing the Firestore DB instance.
 * Provides a central provider for database operations across the application.
 */
export class DBProvider {
  private static instance: DBProvider;
  private db: Firestore.DB | null = null;

  private constructor() {}

  /**
   * Gets the singleton instance of DBProvider.
   */
  static getInstance(): DBProvider {
    if (!DBProvider.instance) {
      DBProvider.instance = new DBProvider();
    }
    return DBProvider.instance;
  }

  /**
   * Initializes the Firestore DB instance using the provided credentials.
   *
   * @param params Configuration parameters for initializing Firestore
   * @returns A promise that resolves to the initialized DB instance
   */
  async initialize(params: {
    project_id: string;
    private_key_id: string;
    client_email: string;
    private_key: string;
    uid: string;
    claims?: Record<string, string>;
  }): Promise<Firestore.DB> {
    this.db = await init(params);
    return this.db;
  }

  /**
   * Gets the current DB instance.
   *
   * @throws Error if DB has not been initialized
   */
  getDB(): Firestore.DB {
    if (!this.db) {
      throw new Error(
        'DBProvider has not been initialized. Call DBProvider.getInstance().initialize() first.'
      );
    }
    return this.db;
  }

  /**
   * Checks if the DB instance has been initialized.
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Resets the DB instance (primarily for testing purposes).
   */
  reset(): void {
    this.db = null;
  }
}
