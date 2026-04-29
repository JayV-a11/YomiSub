import { renderSettingsForm } from './settings-form'
import { renderFlashcardView } from './flashcard-view'

type Tab = 'settings' | 'deck'

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')
  if (app === null) return
  renderApp(app)
})

function renderApp(app: HTMLElement): void {
  app.innerHTML = buildShell()

  const settingsPanel = app.querySelector<HTMLElement>('#ys-tab-settings')!
  const deckPanel = app.querySelector<HTMLElement>('#ys-tab-deck')!

  renderSettingsForm(settingsPanel)
  renderFlashcardView(deckPanel)

  app.querySelectorAll<HTMLButtonElement>('.ys-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(app, btn.dataset.tab as Tab)
    })
  })
}

function switchTab(app: HTMLElement, tab: Tab): void {
  app.querySelectorAll<HTMLButtonElement>('.ys-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  })
  app.querySelectorAll<HTMLElement>('.ys-tab-panel').forEach((panel) => {
    panel.style.display = panel.id === `ys-tab-${tab}` ? 'block' : 'none'
  })
}

function buildShell(): string {
  return `
    <div class="ys-header">
      <h1>YomiSub</h1>
      <span class="ys-badge">0.1</span>
    </div>
    <div class="ys-tabs" role="tablist">
      <button class="ys-tab-btn active" data-tab="settings" role="tab" aria-selected="true">Settings</button>
      <button class="ys-tab-btn" data-tab="deck" role="tab" aria-selected="false">Deck</button>
    </div>
    <div id="ys-tab-settings" class="ys-tab-panel"></div>
    <div id="ys-tab-deck" class="ys-tab-panel" style="display:none"></div>
  `
}
