// Keyword-based classification for skills and MCPs. Lightweight, deterministic,
// no LLM round-trips. Fall-through order matters: first matching bucket wins.
//
// The goal is "close enough" grouping in the Library UI, not semantic precision.
// If a skill/MCP genuinely straddles two topics the first-match ordering below
// is the tie-breaker — tune it here rather than sprinkling overrides in the UI.

export type SkillTopic = 'Writing' | 'Design' | 'Dev tooling' | 'Research' | 'Media' | 'Other'
export type McpCategory = 'Data' | 'Productivity' | 'Development' | 'AI' | 'Other'

export const SKILL_TOPICS: SkillTopic[] = ['Writing', 'Design', 'Dev tooling', 'Research', 'Media', 'Other']
export const MCP_CATEGORIES: McpCategory[] = ['Data', 'Productivity', 'Development', 'AI', 'Other']

const SKILL_KEYWORDS: Array<{ topic: SkillTopic; patterns: RegExp[] }> = [
  {
    topic: 'Design',
    patterns: [/\bcanva\b/i, /\bfigma\b/i, /\bdesign\b/i, /\bui\b/i, /\blayout\b/i, /\bpresentation\b/i, /\bbrand/i, /\bslides?\b/i],
  },
  {
    topic: 'Media',
    patterns: [/\bvideo\b/i, /\bimage\b/i, /\baudio\b/i, /\bshorts?\b/i, /\byoutube\b/i, /\bimmersive\b/i, /\b3d\b/i, /\banimation\b/i, /\bremotion\b/i],
  },
  {
    topic: 'Writing',
    patterns: [/\bwriting\b/i, /\bcopy/i, /\barticle\b/i, /\bemail\b/i, /\bscript\b/i, /\bcontract\b/i, /\bproposal\b/i, /\bblog/i, /\bnewsletter\b/i, /\beditor/i],
  },
  {
    topic: 'Research',
    patterns: [/\bresearch\b/i, /\bsearch\b/i, /\banaly[sz]e\b/i, /\banaly[sz]is\b/i, /\baudit\b/i, /\bcompetiti/i, /\batlas\b/i, /\blearning\b/i, /\bintelligence\b/i, /\bevidence\b/i],
  },
  {
    topic: 'Dev tooling',
    patterns: [/\bcode\b/i, /\brefactor\b/i, /\bdebug\b/i, /\breview\b/i, /\blint\b/i, /\btest(s|ing)?\b/i, /\bbuild\b/i, /\bgit\b/i, /\bbackend\b/i, /\bfrontend\b/i, /\bdatabase\b/i, /\bdevops\b/i, /\bapi\b/i, /\btypescript\b/i, /\bpython\b/i, /\bgo(lang)?\b/i, /\bsql\b/i, /\bpatterns?\b/i, /\bcodebase\b/i, /\be2e\b/i],
  },
]

const MCP_KEYWORDS: Array<{ category: McpCategory; patterns: RegExp[] }> = [
  {
    category: 'Data',
    patterns: [/\bdatabase\b/i, /\bsql\b/i, /\bpostgres/i, /\bsupabase\b/i, /\bmongo/i, /\bfirebase\b/i, /\bbigquery\b/i, /\bredis\b/i, /\bpinecone\b/i],
  },
  {
    category: 'AI',
    patterns: [/\bopenai\b/i, /\banthropic\b/i, /\bhugging/i, /\breplicate\b/i, /\bllm\b/i, /\bcontext7\b/i],
  },
  {
    category: 'Development',
    patterns: [/\bgithub\b/i, /\bgitlab\b/i, /\bsentry\b/i, /\bvercel\b/i, /\bplaywright\b/i, /\bchrome/i, /\bjcodemunch\b/i, /\bsemgrep\b/i, /\bcoderabbit\b/i, /\bgreptile\b/i, /\bplayground\b/i, /\bserena\b/i, /\b-lsp\b/i, /-lsp$/i, /\bsupabase\b/i],
  },
  {
    category: 'Productivity',
    patterns: [/\bnotion\b/i, /\bslack\b/i, /\bobsidian\b/i, /\bgoogle\b/i, /\bgdrive\b/i, /\bdrive\b/i, /\blinear\b/i, /\basana\b/i, /\batlassian\b/i, /\bjira\b/i, /\bconfluence\b/i, /\btelegram\b/i, /\bstripe\b/i, /\bposthog\b/i, /\bcalendar\b/i],
  },
]

export function classifySkill(name: string, description: string): SkillTopic {
  const haystack = `${name} ${description}`
  for (const bucket of SKILL_KEYWORDS) {
    if (bucket.patterns.some((p) => p.test(haystack))) return bucket.topic
  }
  return 'Other'
}

export function classifyMcp(name: string): McpCategory {
  for (const bucket of MCP_KEYWORDS) {
    if (bucket.patterns.some((p) => p.test(name))) return bucket.category
  }
  return 'Other'
}
