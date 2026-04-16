import https from 'https'

const CATALOG_URL = 'https://raw.githubusercontent.com/UnlimitedxIQ/uo-claude-marketplace/main/catalog.json'

// Shape of what the remote catalog returns. We don't trust the remote — all
// fields are optional and missing values get filled in from defaults when
// merged with the local INITIAL_PACKS.
export interface RemotePack {
  id: string
  name: string
  description: string
  icon: string
  color?: string
  skillIds?: string[]
  mcpIds?: string[]
  preInstalled?: boolean
}

export interface RemoteMcp {
  id: string
  name: string
  description: string
  icon: string
  category?: 'data' | 'productivity' | 'development' | 'ai'
  preInstalled?: boolean
  requiresAccess?: string
  requiredCredentials?: Array<{
    vaultKey: string
    label: string
    placeholder: string
    category: string
  }>
}

export interface RemoteCatalog {
  version: string
  lastUpdated: string
  packs: RemotePack[]
  mcps: RemoteMcp[]
}

/**
 * Fetch the live marketplace catalog from GitHub. Returns null on any error
 * (timeout, network, malformed JSON) so the caller can fall back to local data.
 * 5 second timeout — marketplace is nice-to-have, not critical path.
 */
export async function fetchCatalog(): Promise<RemoteCatalog | null> {
  return new Promise((resolve) => {
    const req = https.get(CATALOG_URL, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        resolve(null)
        return
      }
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as RemoteCatalog
          if (!Array.isArray(parsed.packs) || !Array.isArray(parsed.mcps)) {
            resolve(null)
            return
          }
          resolve(parsed)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
  })
}
