import { promises as fs } from 'fs'
import path from 'path'
import type {
  ReferenceAsset,
  FacetPack,
  IntentSpec,
  GeneratedCode,
  AuditReport,
} from '@style-print-jung/shared'

// Data directory path
const DATA_DIR = path.join(process.cwd(), 'data')

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
}

// In-memory cache of each file's parsed contents. The API is a single-process
// server, so once a file is loaded we keep it in memory instead of re-reading
// and re-parsing it from disk on every request. Writes update the cache and
// persist to disk; reads are served from the cache after the first load.
const cache = new Map<string, unknown[]>()
const RUNTIME_FILES = [
  'references.json',
  'facet-packs.json',
  'intents.json',
  'generated-code.json',
  'audit-reports.json',
]

// Generic read/write helpers
async function readJSON<T>(filename: string): Promise<T[]> {
  const cached = cache.get(filename)
  if (cached) {
    return cached as T[]
  }

  await ensureDataDir()
  const filepath = path.join(DATA_DIR, filename)
  try {
    const data = await fs.readFile(filepath, 'utf-8')
    const parsed = JSON.parse(data) as T[]
    cache.set(filename, parsed)
    return parsed
  } catch {
    const empty: T[] = []
    cache.set(filename, empty)
    return empty
  }
}

async function writeJSON<T>(filename: string, data: T[]): Promise<void> {
  cache.set(filename, data)
  await ensureDataDir()
  const filepath = path.join(DATA_DIR, filename)
  await fs.writeFile(filepath, JSON.stringify(data, null, 2))
}

export async function clearRuntimeData(): Promise<void> {
  await ensureDataDir()

  await Promise.all(
    RUNTIME_FILES.map((filename) => writeJSON(filename, []))
  )
}

// ============================================
// References
// ============================================

const REFERENCES_FILE = 'references.json'

export async function getReferences(): Promise<ReferenceAsset[]> {
  return readJSON<ReferenceAsset>(REFERENCES_FILE)
}

export async function getReference(id: string): Promise<ReferenceAsset | null> {
  const references = await getReferences()
  return references.find((r) => r.id === id) || null
}

export async function saveReference(reference: ReferenceAsset): Promise<void> {
  const references = await getReferences()
  const existing = references.findIndex((r) => r.id === reference.id)
  if (existing >= 0) {
    references[existing] = reference
  } else {
    references.push(reference)
  }
  await writeJSON(REFERENCES_FILE, references)
}

export async function deleteReference(id: string): Promise<void> {
  const references = await getReferences()
  await writeJSON(
    REFERENCES_FILE,
    references.filter((r) => r.id !== id)
  )
}

// ============================================
// Facet Packs
// ============================================

const FACET_PACKS_FILE = 'facet-packs.json'

export async function getFacetPacks(): Promise<FacetPack[]> {
  return readJSON<FacetPack>(FACET_PACKS_FILE)
}

export async function getFacetPack(id: string): Promise<FacetPack | null> {
  const packs = await getFacetPacks()
  return packs.find((p) => p.id === id) || null
}

export async function getFacetPackByRefId(
  refId: string
): Promise<FacetPack | null> {
  const packs = await getFacetPacks()
  return packs.find((p) => p.refId === refId) || null
}

export async function saveFacetPack(pack: FacetPack): Promise<void> {
  const packs = await getFacetPacks()
  const existing = packs.findIndex((p) => p.id === pack.id)
  if (existing >= 0) {
    packs[existing] = pack
  } else {
    packs.push(pack)
  }
  await writeJSON(FACET_PACKS_FILE, packs)
}

export async function deleteFacetPack(id: string): Promise<void> {
  const packs = await getFacetPacks()
  await writeJSON(
    FACET_PACKS_FILE,
    packs.filter((p) => p.id !== id)
  )
}

// ============================================
// Intent Specs
// ============================================

const INTENTS_FILE = 'intents.json'

export async function getIntentSpecs(): Promise<IntentSpec[]> {
  return readJSON<IntentSpec>(INTENTS_FILE)
}

export async function getIntentSpec(id: string): Promise<IntentSpec | null> {
  const specs = await getIntentSpecs()
  return specs.find((s) => s.id === id) || null
}

export async function saveIntentSpec(spec: IntentSpec): Promise<void> {
  const specs = await getIntentSpecs()
  const existing = specs.findIndex((s) => s.id === spec.id)
  if (existing >= 0) {
    specs[existing] = spec
  } else {
    specs.push(spec)
  }
  await writeJSON(INTENTS_FILE, specs)
}

export async function deleteIntentSpec(id: string): Promise<void> {
  const specs = await getIntentSpecs()
  await writeJSON(
    INTENTS_FILE,
    specs.filter((s) => s.id !== id)
  )
}

// ============================================
// Generated Code
// ============================================

const GENERATED_CODE_FILE = 'generated-code.json'

export async function getGeneratedCodes(): Promise<GeneratedCode[]> {
  return readJSON<GeneratedCode>(GENERATED_CODE_FILE)
}

export async function getGeneratedCode(
  id: string
): Promise<GeneratedCode | null> {
  const codes = await getGeneratedCodes()
  return codes.find((c) => c.id === id) || null
}

export async function saveGeneratedCode(code: GeneratedCode): Promise<void> {
  const codes = await getGeneratedCodes()
  const existing = codes.findIndex((c) => c.id === code.id)
  if (existing >= 0) {
    codes[existing] = code
  } else {
    codes.push(code)
  }
  await writeJSON(GENERATED_CODE_FILE, codes)
}

// ============================================
// Audit Reports
// ============================================

const AUDIT_REPORTS_FILE = 'audit-reports.json'

export async function getAuditReports(): Promise<AuditReport[]> {
  return readJSON<AuditReport>(AUDIT_REPORTS_FILE)
}

export async function getAuditReport(id: string): Promise<AuditReport | null> {
  const reports = await getAuditReports()
  return reports.find((r) => r.id === id) || null
}

export async function saveAuditReport(report: AuditReport): Promise<void> {
  const reports = await getAuditReports()
  const existing = reports.findIndex((r) => r.id === report.id)
  if (existing >= 0) {
    reports[existing] = report
  } else {
    reports.push(report)
  }
  await writeJSON(AUDIT_REPORTS_FILE, reports)
}
