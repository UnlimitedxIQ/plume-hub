import { safeStorage } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import Database from 'better-sqlite3'

/**
 * Local encrypted vault for Plume Hub.
 *
 * Stores API tokens, OAuth credentials, and other secrets in a SQLite database
 * at ~/.claude/plume-vault/vault.db. Values are encrypted at rest using
 * Electron's safeStorage (OS-level keychain) and stored as base64 strings.
 */

export type VaultCategory = 'token' | 'api_key' | 'oauth' | 'password' | 'other'

export interface VaultEntry {
  key: string
  value: string // decrypted — only returned by get(), not getAll()
  label: string
  category: VaultCategory
  createdAt: number
  updatedAt: number
}

export interface MaskedVaultEntry {
  key: string
  maskedValue: string // e.g. "ghp_QLJm••••••uRPw"
  label: string
  category: string
  createdAt: number
  updatedAt: number
}

interface EntryRow {
  key: string
  value: string
  label: string
  category: string
  createdAt: number
  updatedAt: number
}

export class Vault {
  private db: Database.Database

  constructor() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'Plume vault: OS encryption (safeStorage) is not available. ' +
          'Cannot safely store secrets — refusing to open vault.'
      )
    }

    const vaultDir = path.join(os.homedir(), '.claude', 'plume-vault')
    if (!existsSync(vaultDir)) {
      mkdirSync(vaultDir, { recursive: true })
    }

    const dbPath = path.join(vaultDir, 'vault.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        key       TEXT PRIMARY KEY,
        value     TEXT NOT NULL,
        label     TEXT NOT NULL,
        category  TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `)
  }

  private encrypt(plain: string): string {
    return safeStorage.encryptString(plain).toString('base64')
  }

  private decrypt(encrypted: string): string {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }

  private maskValue(value: string): string {
    if (value.length < 10) {
      return '\u2022'.repeat(value.length)
    }
    const head = value.slice(0, 4)
    const tail = value.slice(-4)
    return `${head}\u2022\u2022\u2022\u2022\u2022\u2022${tail}`
  }

  /**
   * Retrieve and decrypt a single entry by key.
   * Returns null if no entry exists.
   */
  get(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM entries WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined
    if (!row) return null
    try {
      return this.decrypt(row.value)
    } catch (error) {
      throw new Error(
        `Plume vault: failed to decrypt entry "${key}": ${(error as Error).message}`
      )
    }
  }

  /**
   * Insert or update an entry. Always refreshes updatedAt.
   * createdAt is preserved on update; only set on first insert.
   */
  set(key: string, value: string, label: string, category: string): void {
    const now = Date.now()
    const encrypted = this.encrypt(value)

    const existingStmt = this.db.prepare(
      'SELECT createdAt FROM entries WHERE key = ?'
    )
    const existing = existingStmt.get(key) as { createdAt: number } | undefined
    const createdAt = existing ? existing.createdAt : now

    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO entries (key, value, label, category, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    upsert.run(key, encrypted, label, category, createdAt, now)
  }

  /**
   * Delete an entry by key. Returns true if a row was removed.
   */
  delete(key: string): boolean {
    const stmt = this.db.prepare('DELETE FROM entries WHERE key = ?')
    const info = stmt.run(key)
    return info.changes > 0
  }

  /**
   * Return all entries with masked values, ordered by most recently updated.
   * Values are decrypted only to apply masking — plaintext never leaves the method.
   */
  getAll(): MaskedVaultEntry[] {
    const stmt = this.db.prepare(
      'SELECT key, value, label, category, createdAt, updatedAt FROM entries ORDER BY updatedAt DESC'
    )
    const rows = stmt.all() as EntryRow[]
    return rows.map((row) => {
      let maskedValue: string
      try {
        const decrypted = this.decrypt(row.value)
        maskedValue = this.maskValue(decrypted)
      } catch {
        maskedValue = '\u2022\u2022\u2022\u2022\u2022\u2022'
      }
      return {
        key: row.key,
        maskedValue,
        label: row.label,
        category: row.category,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    })
  }

  /**
   * Close the underlying SQLite connection.
   */
  close(): void {
    this.db.close()
  }
}

let _instance: Vault | null = null

/**
 * Lazily-constructed singleton accessor. The vault is opened on first call
 * (which is only safe after Electron's `app.ready` event, since safeStorage
 * requires the app to be initialized).
 */
export function getVault(): Vault {
  if (!_instance) {
    _instance = new Vault()
  }
  return _instance
}
