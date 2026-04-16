import type React from 'react'
import {
  GraduationCap, BookOpen, Code2, TrendingUp, Zap, Palette,
  BarChart3, MessageCircle, HardDrive, Calendar, FolderOpen,
  FileText, Mail, DollarSign, GitBranch, Monitor, Share2,
  Image, Play, Search, Package,
} from 'lucide-react'

export interface SkillPack {
  id: string
  name: string
  description: string
  icon: React.ElementType
  color: string
  skills: string[]
  preInstalled?: boolean
}

export interface McpCredential {
  vaultKey: string       // the key name in the plume vault, e.g. 'github-pat'
  label: string          // human label for the input field, e.g. 'GitHub Personal Access Token'
  placeholder: string    // input placeholder, e.g. 'ghp_xxxxxxxxxxxx'
  category: 'token' | 'api_key' | 'oauth' | 'password'
}

export interface McpConfigTemplate {
  command: string                          // the command to run, e.g. 'npx'
  args: string[]                           // e.g. ['-y', '@modelcontextprotocol/server-github']
  env?: Record<string, string>             // values can contain `${vault:keyName}` placeholders
}

export interface McpServer {
  id: string
  name: string
  description: string
  icon: React.ElementType
  category: 'data' | 'productivity' | 'development' | 'ai'
  preInstalled?: boolean
  requiredCredentials?: McpCredential[]
  configTemplate?: McpConfigTemplate
}

export const SKILL_PACKS: SkillPack[] = [
  // Featured (pre-installed)
  {
    id: 'student-essentials',
    name: 'Student Essentials',
    description: 'Canvas integration, study tools, and AI writing assistance',
    icon: GraduationCap,
    color: '#FEE123',
    skills: ['Canvas Integration', 'Humanize Writing', 'Study Flashcards'],
    preInstalled: true,
  },
  {
    id: 'academic-writing',
    name: 'Academic Writing',
    description: 'Writing standards, citations, research papers, and presentations',
    icon: BookOpen,
    color: '#3b82f6',
    skills: ['Business Writing', 'Resume Guide', 'Research Paper', 'Article Writing', 'Presentations'],
    preInstalled: true,
  },
  {
    id: 'code-toolkit',
    name: 'Code Toolkit',
    description: 'Coding standards, patterns, and test-driven development',
    icon: Code2,
    color: '#22c55e',
    skills: ['Coding Standards', 'Python Patterns', 'Frontend Patterns', 'Backend Patterns', 'TDD Workflow'],
    preInstalled: true,
  },
  // Marketplace
  {
    id: 'business-finance',
    name: 'Business & Finance',
    description: 'Financial analysis, market research, competitive intelligence',
    icon: TrendingUp,
    color: '#f59e0b',
    skills: ['Financial Analysis', 'Market Research', 'Competitive Teardown', 'Pricing Strategy'],
  },
  {
    id: 'entrepreneurship',
    name: 'Entrepreneurship',
    description: 'MVP building, customer acquisition, launch strategy',
    icon: Zap,
    color: '#ec4899',
    skills: ['MVP Builder', 'First Customers', 'Launch Strategy', 'Investor Materials'],
  },
  {
    id: 'design-creative',
    name: 'Design & Creative',
    description: 'UI/UX, 3D web, premium design, Canva integration',
    icon: Palette,
    color: '#a855f7',
    skills: ['UI/UX', 'Frontend Design', '3D Immersive', 'Overkill Web Design'],
  },
  {
    id: 'devops-infra',
    name: 'DevOps & Infrastructure',
    description: 'Docker, CI/CD, databases, API design, security',
    icon: HardDrive,
    color: '#14b8a6',
    skills: ['Docker Patterns', 'Deployment', 'PostgreSQL', 'API Design', 'Security Review'],
  },
  {
    id: 'data-analytics',
    name: 'Data & Analytics',
    description: 'Data visualization, testing, and interactive tutorials',
    icon: BarChart3,
    color: '#6366f1',
    skills: ['Data Visualization', 'Python Testing', 'E2E Testing'],
  },
  {
    id: 'content-marketing',
    name: 'Content & Marketing',
    description: 'Copywriting, social media, email outreach, landing pages',
    icon: MessageCircle,
    color: '#f97316',
    skills: ['Copywriting', 'Content Engine', 'Cold Email', 'Landing Pages'],
  },
]

export const MCP_SERVERS: McpServer[] = [
  { id: 'canvas-lms',      name: 'Canvas LMS',      description: 'Assignments, rubrics, due dates', icon: GraduationCap, category: 'data',         preInstalled: true },
  { id: 'google-calendar', name: 'Google Calendar', description: 'Schedule and events',             icon: Calendar,      category: 'productivity', preInstalled: true },
  { id: 'web-search',      name: 'Web Search',      description: 'Search current information',     icon: Search,        category: 'data',         preInstalled: true },
  { id: 'filesystem',      name: 'Local Files',     description: 'Read and write local files',     icon: FolderOpen,    category: 'development',  preInstalled: true },
  { id: 'git',             name: 'Git',             description: 'Repository management',          icon: GitBranch,     category: 'development',  preInstalled: true },
  // Available
  { id: 'bloomberg',       name: 'Bloomberg',       description: 'Financial data and market analytics', icon: TrendingUp, category: 'data' },
  { id: 'capital-iq',      name: 'Capital IQ',      description: 'Business research and company data',  icon: BarChart3, category: 'data' },
  { id: 'pitchbook',       name: 'PitchBook',       description: 'VC and PE deal data',                  icon: DollarSign, category: 'data' },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages and databases',
    icon: FileText,
    category: 'productivity',
    requiredCredentials: [
      { vaultKey: 'notion-token', label: 'Notion Integration Token', placeholder: 'secret_xxxxxxxxxx', category: 'token' },
    ],
    configTemplate: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: { NOTION_TOKEN: '${vault:notion-token}' },
    },
  },
  { id: 'gmail',           name: 'Gmail',           description: 'Email management',                    icon: Mail,      category: 'productivity' },
  { id: 'google-drive',    name: 'Google Drive',    description: 'Docs, Sheets, Slides',                icon: HardDrive, category: 'productivity' },
  { id: 'youtube',         name: 'YouTube',         description: 'Video transcripts',                   icon: Play,      category: 'data' },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repos, PRs, code search',
    icon: GitBranch,
    category: 'development',
    requiredCredentials: [
      { vaultKey: 'github-pat', label: 'GitHub Personal Access Token', placeholder: 'ghp_xxxxxxxxxxxx', category: 'token' },
    ],
    configTemplate: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${vault:github-pat}' },
    },
  },
  { id: 'playwright',      name: 'Playwright',      description: 'Browser automation',                  icon: Monitor,   category: 'development' },
  { id: 'mermaid',         name: 'Mermaid',         description: 'Flowcharts and diagrams',             icon: Share2,    category: 'development' },
  {
    id: 'image-gen',
    name: 'Image Generator',
    description: 'AI image generation',
    icon: Image,
    category: 'ai',
    requiredCredentials: [
      { vaultKey: 'openai-key', label: 'OpenAI API Key', placeholder: 'sk-xxxxxxxxxx', category: 'api_key' },
    ],
    configTemplate: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      env: { OPENAI_API_KEY: '${vault:openai-key}' },
    },
  },
  {
    id: 'canva',
    name: 'Canva',
    description: 'Design platform',
    icon: Palette,
    category: 'ai',
    requiredCredentials: [
      { vaultKey: 'canva-token', label: 'Canva API Token', placeholder: 'Enter your Canva API token', category: 'api_key' },
    ],
    configTemplate: {
      command: 'npx',
      args: ['-y', 'canva-mcp'],
      env: { CANVA_TOKEN: '${vault:canva-token}' },
    },
  },
]

export const CATEGORY_LABELS: Record<McpServer['category'], string> = {
  data:         'Data',
  productivity: 'Productivity',
  development:  'Dev',
  ai:           'AI',
}

export const CATEGORY_COLORS: Record<McpServer['category'], string> = {
  data:         '#3b82f6',
  productivity: '#f59e0b',
  development:  '#22c55e',
  ai:           '#a855f7',
}
