import { useState, useCallback, useEffect } from 'react'

interface CalendarDisplay {
  showTitle: boolean
  showTime: boolean
  showLocation: boolean
  showInstructor: boolean
}

interface TermConfig {
  selectedSubjects: string[]
  selectedDays: string[]
  recentSearches: string[]
}

interface AppConfig {
  version: number
  lastModified: string
  currentTerm: string
  calendarDisplay: CalendarDisplay
  termConfigs: {
    [termId: string]: TermConfig
  }
}

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  lastModified: new Date().toISOString(),
  currentTerm: "",
  calendarDisplay: {
    showTitle: false,
    showTime: true,
    showLocation: true,
    showInstructor: false
  },
  termConfigs: {}
}

export function loadConfig(): AppConfig {
  try {
    // Check if we're in browser environment
    if (typeof window === 'undefined') {
      return DEFAULT_CONFIG
    }

    const stored = localStorage.getItem('app-config')
    if (!stored) return DEFAULT_CONFIG

    const parsed = JSON.parse(stored)

    // Simple migration: merge with defaults to handle new fields
    return { ...DEFAULT_CONFIG, ...parsed, version: DEFAULT_CONFIG.version }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem('app-config', JSON.stringify(config))
}

// Helper function to set nested values using path notation
function setNestedPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('/')
  const lastKey = keys.pop()!

  let current: Record<string, unknown> = obj
  for (const key of keys) {
    if (!current[key]) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  current[lastKey] = value
}

export function useAppConfig() {
  const [config, setConfig] = useState(() => DEFAULT_CONFIG)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load real config after hydration to prevent mismatch
  useEffect(() => {
    setConfig(loadConfig())
    setIsHydrated(true)
  }, [])

  const updateConfig = useCallback((path: string, value: unknown) => {
    setConfig(current => {
      const newConfig = { ...current }
      setNestedPath(newConfig, path, value)
      newConfig.lastModified = new Date().toISOString()
      saveConfig(newConfig)
      return newConfig
    })
  }, [])

  return { config, updateConfig, isHydrated }
}

// Export types for use in components
export type { AppConfig, CalendarDisplay, TermConfig }