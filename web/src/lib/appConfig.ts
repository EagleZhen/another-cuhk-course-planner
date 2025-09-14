import { useState, useCallback } from 'react'

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
    showTitle: true,
    showTime: true,
    showLocation: true,
    showInstructor: true
  },
  termConfigs: {}
}

export function loadConfig(): AppConfig {
  try {
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
function setNestedPath(obj: any, path: string, value: any): void {
  const keys = path.split('/')
  const lastKey = keys.pop()!

  let current = obj
  for (const key of keys) {
    if (!current[key]) {
      current[key] = {}
    }
    current = current[key]
  }

  current[lastKey] = value
}

export function useAppConfig() {
  const [config, setConfig] = useState(() => loadConfig())

  const updateConfig = useCallback((path: string, value: any) => {
    setConfig(current => {
      const newConfig = { ...current }
      setNestedPath(newConfig, path, value)
      newConfig.lastModified = new Date().toISOString()
      saveConfig(newConfig)
      return newConfig
    })
  }, [])

  return { config, updateConfig }
}

// Export types for use in components
export type { AppConfig, CalendarDisplay, TermConfig }