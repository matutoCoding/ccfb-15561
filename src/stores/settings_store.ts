import { defineStore } from 'pinia'
import { loadSettings, saveSettings } from '@/core/db'
import { DEFAULT_SETTINGS, type AppSettings } from '@/core/types'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    settings: { ...DEFAULT_SETTINGS },
    loaded: false,
  }),
  actions: {
    async load() {
      this.settings = await loadSettings()
      this.loaded = true
      this.applyTheme()
    },
    async update(patch: Partial<AppSettings>) {
      this.settings = { ...this.settings, ...patch }
      await saveSettings(this.settings)
      this.applyTheme()
    },
    applyTheme() {
      document.documentElement.dataset.theme = this.settings.theme
    },
  },
})
