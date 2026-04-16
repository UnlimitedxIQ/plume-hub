export interface SkillPack {
  id: string
  name: string
  emoji: string
  description: string
  tags: string[]
}

export const SKILL_PACKS: SkillPack[] = [
  {
    id: 'essay-writer',
    name: 'Essay Writer',
    emoji: '✍️',
    description: 'Outlines, drafts, and revises essays with strong thesis development and citation support.',
    tags: ['writing', 'academic'],
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    emoji: '🔍',
    description: 'Finds sources, summarizes articles, builds bibliographies, and fact-checks claims.',
    tags: ['research', 'citations'],
  },
  {
    id: 'presentation-builder',
    name: 'Presentation Builder',
    emoji: '📊',
    description: 'Creates slide outlines, speaker notes, and compelling visual content plans.',
    tags: ['slides', 'visual'],
  },
  {
    id: 'math-solver',
    name: 'Math & Stats Solver',
    emoji: '📐',
    description: 'Step-by-step solutions for calculus, stats, linear algebra, and finance math.',
    tags: ['math', 'stats'],
  },
  {
    id: 'code-explainer',
    name: 'Code Explainer',
    emoji: '💻',
    description: 'Explains code, debugs errors, and writes programs in Python, JavaScript, and more.',
    tags: ['coding', 'debug'],
  },
  {
    id: 'case-analyst',
    name: 'Business Case Analyst',
    emoji: '📈',
    description: 'Frameworks for Porter\'s 5 Forces, SWOT, DCF, and strategy case studies.',
    tags: ['business', 'strategy'],
  },
  {
    id: 'exam-prep',
    name: 'Exam Prep',
    emoji: '🎯',
    description: 'Generates practice questions, flashcards, and study guides from your notes.',
    tags: ['study', 'flashcards'],
  },
  {
    id: 'reading-summarizer',
    name: 'Reading Summarizer',
    emoji: '📚',
    description: 'Condenses readings into key points, critical questions, and discussion notes.',
    tags: ['reading', 'notes'],
  },
]
