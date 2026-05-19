import { CARD_TYPE_PATTERNS } from './cardConfigData'

interface ClusterOption {
  name: string
}

export interface PromptExtractionResult {
  config: Record<string, unknown>
  behaviors: Record<string, boolean>
  title?: string
}

export function detectCardType(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase()

  for (const { patterns, cardType } of CARD_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (lowerPrompt.includes(pattern)) {
        return cardType
      }
    }
  }
  return null
}

export function extractConfigFromPrompt(prompt: string, clusters: ClusterOption[]): PromptExtractionResult {
  const lowerPrompt = prompt.toLowerCase()
  const newConfig: Record<string, unknown> = {}
  const newBehaviors: Record<string, boolean> = {}
  let extractedTitle: string | undefined

  // Cluster extraction
  const clusterMatch = prompt.match(/(?:from|in|for|on|cluster[:\s]+)([a-z0-9-_]+)(?:\s+cluster)?/i)
  if (clusterMatch && clusterMatch[1]) {
    const clusterName = clusterMatch[1]
    const matchedCluster = clusters.find(c =>
      c.name.toLowerCase().includes(clusterName.toLowerCase()) ||
      clusterName.toLowerCase().includes(c.name.toLowerCase())
    )
    if (matchedCluster) {
      newConfig.cluster = matchedCluster.name
    } else {
      // Still set it even if not found - might be valid
      newConfig.cluster = clusterName
    }
  }

  // Namespace extraction
  const namespaceMatch = prompt.match(/(?:namespace[:\s]+|ns[:\s]+|in\s+)([a-z0-9-_]+)/i)
  if (namespaceMatch && namespaceMatch[1]) {
    newConfig.namespace = namespaceMatch[1]
  }

  // Limit extraction
  const limitMatch = prompt.match(/(?:show|display|limit|max|top)\s*(\d+)/i)
  if (limitMatch && limitMatch[1]) {
    newConfig.limit = parseInt(limitMatch[1])
  }

  // Behaviors based on keywords
  if (lowerPrompt.includes('warning') || lowerPrompt.includes('error')) {
    newBehaviors.warningsOnly = true
  }
  if (lowerPrompt.includes('alert') || lowerPrompt.includes('notify')) {
    newBehaviors.alertOnNew = true
    newBehaviors.alertOnCritical = true
  }
  if (lowerPrompt.includes('sound') && !lowerPrompt.includes('no sound')) {
    newBehaviors.soundOnWarning = true
  }
  if (lowerPrompt.includes('group') && lowerPrompt.includes('cluster')) {
    newBehaviors.groupByCluster = true
  }
  if (lowerPrompt.includes('unhealthy') && (lowerPrompt.includes('first') || lowerPrompt.includes('priority'))) {
    newBehaviors.showUnhealthyFirst = true
  }

  // Title extraction
  const titleMatch = prompt.match(/(?:title|name|call it|called)[:\s]+["']?([^"']+)["']?$/i)
  if (titleMatch && titleMatch[1]) {
    extractedTitle = titleMatch[1].trim()
  }

  return { config: newConfig, behaviors: newBehaviors, title: extractedTitle }
}
