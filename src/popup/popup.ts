import { renderSettingsForm } from './settings-form'

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')
  if (app === null) return
  renderSettingsForm(app)
})
