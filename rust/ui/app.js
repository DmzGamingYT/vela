(() => {
  'use strict'

  const native = !!(window.ipc && typeof window.ipc.postMessage === 'function')
  const pending = new Map()
  let sequence = 0

  const app = {
    state: null,
    notes: [],
    noteId: null,
    meta: { platform: 'macos', dataDir: '', version: '0.1' },
    overlay: null,
    draftColor: '#5b7dff',
    systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    addressFocused: false,
    addressHovered: false
  }

  /* --- Pont vers Rust ------------------------------------------ */

  window.__vela = {
    receive(message) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.ok) request.resolve(message.data)
      else request.reject(new Error(message.error || 'Erreur inconnue'))
    },
    event(message) {
      if (!message || !message.type) return
      if (message.type === 'state') {
        app.state = message.data
        render()
      } else if (message.type === 'notes') {
        app.notes = message.data || []
        renderNotes()
      } else if (message.type === 'window') {
        reportLayout()
      }
    }
  }

  function invoke(cmd, args = {}) {
    if (!native) return mockInvoke(cmd, args)
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error('L’hôte ne répond pas'))
      }, 15000)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
      window.ipc.postMessage(JSON.stringify({ id, cmd, args }))
    })
  }

  /* --- Utilitaires --------------------------------------------- */

  const $ = (selector) => document.querySelector(selector)

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char])

  const TINTS = ['#8db9f2', '#88d0b3', '#e6cb80', '#a88cff', '#62c8ff', '#ff9d8a']

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch (error) {
      return url || ''
    }
  }

  function tintFor(value) {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) % 9973
    }
    return TINTS[hash % TINTS.length]
  }

  function initials(value) {
    const clean = String(value || '?').replace(/^www\./, '')
    const label = clean.split(/[.\-_/]/).filter(Boolean)[0] || '?'
    return label.slice(0, 1).toUpperCase()
  }

  function timeAgo(timestamp) {
    const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000))
    if (seconds < 60) return 'à l’instant'
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `il y a ${minutes} min`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `il y a ${hours} h`
    const days = Math.round(hours / 24)
    return days === 1 ? 'hier' : `il y a ${days} j`
  }

  function activeTab() {
    return app.state?.tabs.find((tab) => tab.id === app.state.active_tab) || null
  }

  function activeSpace() {
    return app.state?.spaces.find((space) => space.id === app.state.active_space) || null
  }

  /* --- Thème ---------------------------------------------------- */

  function resolveTheme() {
    const setting = app.state?.settings?.theme || 'system'
    if (setting === 'light') return 'light'
    if (setting === 'dark') return 'dark'
    return app.systemDark ? 'dark' : 'light'
  }

  function applyTheme() {
    document.documentElement.dataset.theme = resolveTheme()
    const active = app.state?.settings?.theme || 'system'
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.dataset.active = String(button.dataset.themeChoice === active)
    })
  }

  async function setTheme(setting) {
    if (app.state) app.state.settings.theme = setting
    applyTheme()
    try {
      await invoke('settings.update', { theme: setting })
    } catch (error) {
      console.warn(error)
    }
  }

  /* --- Rendu ---------------------------------------------------- */

  function render() {
    if (!app.state) return
    applyTheme()
    renderSpaces()
    renderTabs()
    renderToolbar()
    renderStart()
    renderSidebar()
    renderSettings()
    $('#isolation-note').textContent =
      app.meta.isolation === 'native' ? 'Sessions isolées par espace' : 'Sessions partagées sur cette plateforme'
    reportLayout()
  }

  function renderSpaces() {
    const host = $('#spaces')
    const spaces = app.state.spaces
    host.innerHTML = spaces
      .map((space) => {
        const active = space.id === app.state.active_space
        return `<button class="space-chip" type="button" data-space="${escapeHtml(space.id)}"
          data-active="${active}" style="--space:${escapeHtml(space.color)}"
          title="${escapeHtml(space.name)}" aria-label="${escapeHtml(space.name)}">${escapeHtml(
            space.name.slice(0, 1).toUpperCase()
          )}</button>`
      })
      .join('')
  }

  function renderSidebar() {
    const space = activeSpace()
    if (space) {
      $('#space-name').textContent = space.name
      const dot = $('#space-dot')
      dot.style.setProperty('--space', space.color)
      // Identité visuelle pilotée par l'espace actif (façon Dia).
      document.documentElement.style.setProperty('--space-accent', space.color)
    }
    document.querySelector('.shell').dataset.collapsed = String(!!app.state.settings.sidebar_collapsed)
  }

  function renderTabs() {
    const list = $('#tabs')
    const tabs = app.state.tabs.filter((tab) => tab.space_id === app.state.active_space)
    $('#space-name').textContent = activeSpace()?.name || 'Vela'
    if (!tabs.length) {
      list.innerHTML = '<p class="empty">Aucun onglet. ⌘T pour commencer.</p>'
      return
    }
    list.innerHTML = tabs
      .map((tab) => {
        const host = hostOf(tab.url)
        const label = tab.title || (tab.url ? host : 'Nouvel onglet')
        const tint = tintFor(host || label)
        const active = tab.id === app.state.active_tab
        return `<div class="tab" role="tab" tabindex="0" data-tab="${escapeHtml(tab.id)}"
            data-active="${active}" data-loading="${tab.loading}" aria-selected="${active}">
            <span class="tab-mark" style="--tint:${tint}">${escapeHtml(initials(host || label))}</span>
            <span class="tab-copy">
              <span class="tab-title">${escapeHtml(label)}</span>
              <span class="tab-host">${escapeHtml(tab.url ? host : 'Page d’accueil')}</span>
            </span>
            <button class="tab-close" type="button" data-close="${escapeHtml(tab.id)}" aria-label="Fermer l’onglet">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>`
      })
      .join('')
  }

  function renderToolbar() {
    const tab = activeTab()
    const address = $('#address')
    const hasPage = !!tab?.url
    // Nom de site d'abord (Dia/Zephium) : le titre au repos, l'URL au focus.
    const pageName = tab?.title || (hasPage ? hostOf(tab.url) : '')
    if (document.activeElement !== address) {
      address.value = app.addressFocused || app.addressHovered ? tab?.url || '' : pageName
    }
    $('#site-hint').textContent =
      document.activeElement === address || app.addressHovered || !hasPage ? '' : hostOf(tab.url)
    const back = $('#back')
    const forward = $('#forward')
    back.disabled = !tab?.can_back
    forward.disabled = !tab?.can_forward
    const progress = $('#progress')
    progress.hidden = !tab?.loading
    const reload = $('#reload')
    reload.setAttribute('aria-label', tab?.loading ? 'Arrêter' : 'Recharger')
    reload.dataset.loading = String(!!tab?.loading)
    reload.innerHTML = tab?.loading
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>'
  }

  function renderStart() {
    const tab = activeTab()
    const hasPage = !!tab?.url
    $('#start').hidden = hasPage
    const hour = new Date().getHours()
    $('#greeting').textContent = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
    $('#today').textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date())

    const history = (app.state.history || []).slice(0, 6)
    const list = $('#recent')
    $('#recent-empty').hidden = history.length > 0
    list.innerHTML = history
      .map((entry) => {
        const host = hostOf(entry.url)
        return `<button class="recent" type="button" data-url="${escapeHtml(entry.url)}">
            <span class="recent-mark" style="--tint:${tintFor(host)}">${escapeHtml(initials(host))}</span>
            <span class="recent-copy">
              <span class="recent-title">${escapeHtml(entry.title || host)}</span>
              <span class="recent-host">${escapeHtml(host)} · ${escapeHtml(timeAgo(entry.visited_at))}</span>
            </span>
          </button>`
      })
      .join('')
  }

  function renderSettings() {
    $('#data-path').textContent = app.meta.dataDir || '—'
    $('#platform').textContent = app.meta.platform === 'macos' ? 'macOS · WKWebView' : app.meta.platform === 'windows' ? 'Windows · WebView2' : app.meta.platform
    $('#version').textContent = app.meta.version || '0.1'
    $('#isolation-text').textContent =
      app.meta.isolation === 'native'
        ? 'Chaque espace utilise un magasin de données séparé : cookies, stockage local et cache ne se croisent jamais.'
        : 'Cette plateforme partage un seul magasin de données ; les espaces restent des groupes d’onglets.'
    applyTheme()
  }

  function renderNotes() {
    const list = $('#notes-list')
    if (!app.notes.length) {
      list.innerHTML = '<span class="empty">Aucune note pour l’instant.</span>'
      return
    }
    list.innerHTML = app.notes
      .map(
        (note) => `<button class="note-chip" type="button" data-note="${escapeHtml(note.id)}"
          data-active="${note.id === app.noteId}">${escapeHtml(note.title)}</button>`
      )
      .join('')
  }

  /* --- Interactions --------------------------------------------- */

  function openOverlay(name) {
    app.overlay = name
    $('#drawer').hidden = name !== 'notes'
    $('#settings-modal').hidden = name !== 'settings'
    $('#space-modal').hidden = name !== 'space'
    invoke('overlay', { open: !!name }).catch(() => {})
    if (name === 'notes') {
      const body = $('#note-body')
      setTimeout(() => body.focus(), 60)
    }
    if (name === 'space') {
      const input = $('#space-input')
      input.value = ''
      app.draftColor = '#5b7dff'
      setTimeout(() => input.focus(), 60)
      renderSwatches()
    }
  }

  function closeOverlay() {
    if (!app.overlay) return
    app.overlay = null
    $('#drawer').hidden = true
    $('#settings-modal').hidden = true
    $('#space-modal').hidden = true
    invoke('overlay', { open: false }).catch(() => {})
  }

  function renderSwatches() {
    document.querySelectorAll('[data-color]').forEach((button) => {
      button.dataset.active = String(button.dataset.color === app.draftColor)
    })
  }

  async function navigate(input) {
    const tab = activeTab()
    if (!tab || !input.trim()) return
    try {
      await invoke('tab.navigate', { id: tab.id, url: input.trim() })
    } catch (error) {
      console.warn(error)
    }
  }

  async function selectTab(id) {
    try {
      await invoke('tab.select', { id })
    } catch (error) {
      console.warn(error)
    }
  }

  async function closeTab(id) {
    try {
      await invoke('tab.close', { id })
    } catch (error) {
      console.warn(error)
    }
  }

  async function selectSpace(id) {
    try {
      await invoke('space.select', { id })
    } catch (error) {
      console.warn(error)
    }
  }

  async function loadNote(id) {
    try {
      const result = await invoke('notes.read', { id })
      app.noteId = id
      const note = app.notes.find((item) => item.id === id)
      $('#note-title').value = note?.title || ''
      $('#note-body').value = result.body || ''
      $('#note-path').textContent = `${app.meta.dataDir}/notes/${id}.md`
      renderNotes()
    } catch (error) {
      console.warn(error)
    }
  }

  function newNote() {
    app.noteId = null
    $('#note-title').value = ''
    $('#note-body').value = ''
    $('#note-path').textContent = ''
    renderNotes()
    $('#note-title').focus()
  }

  async function saveNote() {
    const title = $('#note-title').value.trim() || 'Note'
    const body = $('#note-body').value
    try {
      const result = await invoke('notes.save', { id: app.noteId, title, body })
      app.noteId = result?.id || app.noteId
      const notes = await invoke('notes.list')
      if (notes) app.notes = notes
      renderNotes()
      $('#note-path').textContent = app.noteId ? `${app.meta.dataDir}/notes/${app.noteId}.md` : ''
    } catch (error) {
      console.warn(error)
    }
  }

  const actions = {
    home: () => invoke('tab.create', {}).catch(() => {}),
    'new-tab': () => invoke('tab.create', {}).catch(() => {}),
    'new-space': () => openOverlay('space'),
    notes: () => openOverlay(app.overlay === 'notes' ? null : 'notes'),
    settings: () => openOverlay(app.overlay === 'settings' ? null : 'settings'),
    'close-overlay': () => closeOverlay(),
    'focus-address': () => {
      const address = $('#address')
      address.focus()
      address.select()
    },
    back: () => activeTab() && invoke('tab.back', { id: activeTab().id }).catch(() => {}),
    forward: () => activeTab() && invoke('tab.forward', { id: activeTab().id }).catch(() => {}),
    reload: () => {
      const tab = activeTab()
      if (!tab) return
      invoke(tab.loading ? 'tab.stop' : 'tab.reload', { id: tab.id }).catch(() => {})
    },
    theme: () => setTheme(resolveTheme() === 'light' ? 'dark' : 'light'),
    collapse: () => {
      if (!app.state) return
      app.state.settings.sidebar_collapsed = !app.state.settings.sidebar_collapsed
      render()
      invoke('settings.update', { sidebarCollapsed: app.state.settings.sidebar_collapsed }).catch(() => {})
    },
    'clear-history': () => {
      if (!app.state) return
      app.state.history = []
      renderStart()
      invoke('history.clear').catch(() => {})
    },
    'open-notes': () => {
      openOverlay('notes')
    },
    'save-note': () => saveNote(),
    'new-note': () => newNote(),
    'create-space': () => {
      const name = $('#space-input').value.trim() || 'Nouvel espace'
      invoke('space.create', { name, color: app.draftColor })
        .then(() => closeOverlay())
        .catch(() => {})
    }
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')
    if (action) {
      const handler = actions[action.dataset.action]
      if (handler) handler()
      return
    }

    const space = event.target.closest('[data-space]')
    if (space) {
      selectSpace(space.dataset.space)
      return
    }

    const close = event.target.closest('[data-close]')
    if (close) {
      closeTab(close.dataset.close)
      return
    }

    const tab = event.target.closest('[data-tab]')
    if (tab) {
      selectTab(tab.dataset.tab)
      return
    }

    const link = event.target.closest('[data-url]')
    if (link) {
      navigate(link.dataset.url)
      return
    }

    const themeChoice = event.target.closest('[data-theme-choice]')
    if (themeChoice) {
      setTheme(themeChoice.dataset.themeChoice)
      return
    }

    const note = event.target.closest('[data-note]')
    if (note) {
      loadNote(note.dataset.note)
      return
    }

    const color = event.target.closest('[data-color]')
    if (color) {
      app.draftColor = color.dataset.color
      renderSwatches()
      return
    }

    if (event.target.classList.contains('modal')) closeOverlay()
  })

  document.addEventListener('keydown', (event) => {
    const tabKey = event.target.closest?.('[data-tab]')
    if (tabKey && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      selectTab(tabKey.dataset.tab)
      return
    }

    if (event.key === 'Escape') {
      if (app.overlay) {
        closeOverlay()
      } else if (document.activeElement === $('#address')) {
        $('#address').blur()
      }
      return
    }

    const mod = event.metaKey || event.ctrlKey
    if (!mod) return
    const tab = activeTab()
    switch (event.key.toLowerCase()) {
      case 't':
        event.preventDefault()
        invoke('tab.create', {}).catch(() => {})
        break
      case 'w':
        if (tab) {
          event.preventDefault()
          closeTab(tab.id)
        }
        break
      case 'l':
        event.preventDefault()
        $('#address').focus()
        $('#address').select()
        break
      case 'r':
        if (tab) {
          event.preventDefault()
          invoke('tab.reload', { id: tab.id }).catch(() => {})
        }
        break
      case 'e':
        event.preventDefault()
        actions.notes()
        break
      case ',':
        event.preventDefault()
        actions.settings()
        break
      case 's':
        event.preventDefault()
        actions.collapse()
        break
      default:
        break
    }
  })

  $('#omnibox').addEventListener('submit', (event) => {
    event.preventDefault()
    navigate($('#address').value)
    $('#address').blur()
  })

  $('#address').addEventListener('focus', () => {
    app.addressFocused = true
    $('#address').select()
  })

  $('#address').addEventListener('blur', () => {
    app.addressFocused = false
    renderToolbar()
  })

  $('#omnibox').addEventListener('mouseenter', () => {
    app.addressHovered = true
    renderToolbar()
  })

  $('#omnibox').addEventListener('mouseleave', () => {
    app.addressHovered = false
    renderToolbar()
  })

  $('#space-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') actions['create-space']()
  })

  /* --- Mise en page --------------------------------------------- */

  let layoutFrame = 0
  function reportLayout() {
    if (layoutFrame) return
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0
      const slot = $('#page-slot')
      if (!slot) return
      const rect = slot.getBoundingClientRect()
      invoke('layout', {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }).catch(() => {})
    })
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => reportLayout()).observe(document.body)
  }
  window.addEventListener('resize', reportLayout)

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    app.systemDark = event.matches
    applyTheme()
  })

  /* --- Démarrage ------------------------------------------------ */

  async function boot() {
    try {
      const result = await invoke('init')
      app.state = result.state
      app.notes = result.notes || []
      app.meta = {
        platform: result.platform || 'macos',
        dataDir: result.dataDir || '',
        version: result.version || '0.1',
        isolation: result.isolation || 'shared'
      }
      if (app.notes.length) {
        app.noteId = app.notes[0].id
      }
      render()
      renderNotes()
      reportLayout()
    } catch (error) {
      console.warn(error)
    }
  }

  boot()

  /* --- Mode aperçu (sans hôte Rust) ----------------------------- */

  const mock = {
    spaces: [
      { id: 'space-personnel', name: 'Personnel', color: '#5b7dff', store_id: [] },
      { id: 'space-recherche', name: 'Recherche', color: '#a88cff', store_id: [] },
      { id: 'space-lecture', name: 'Lecture', color: '#88d0b3', store_id: [] }
    ],
    tabs: [
      { id: 'tab-1', space_id: 'space-personnel', url: '', title: 'Nouvel onglet', loading: false, can_back: false, can_forward: false },
      { id: 'tab-2', space_id: 'space-personnel', url: 'https://github.com/vela-browser', title: 'Vela — GitHub', loading: false, can_back: true, can_forward: false },
      { id: 'tab-3', space_id: 'space-personnel', url: 'https://www.lemonde.fr/sciences', title: 'La ville respire autrement', loading: false, can_back: true, can_forward: false }
    ],
    history: [
      { id: 'h1', url: 'https://www.lemonde.fr/sciences', title: 'La ville respire autrement', visited_at: Date.now() - 1000 * 60 * 26 },
      { id: 'h2', url: 'https://github.com/vela-browser', title: 'Vela — GitHub', visited_at: Date.now() - 1000 * 60 * 95 },
      { id: 'h3', url: 'https://news.ycombinator.com', title: 'Hacker News', visited_at: Date.now() - 1000 * 60 * 60 * 20 }
    ],
    settings: { theme: 'system', sidebar_collapsed: false },
    active_space: 'space-personnel',
    active_tab: 'tab-1',
    notes: [
      { id: 'brief-du-jour', title: 'Brief du jour', updated_at: Date.now(), excerpt: 'Trois gestes pour la journée.' },
      { id: 'reunion-produit', title: 'Réunion produit', updated_at: Date.now(), excerpt: 'Décisions et prochaines étapes.' }
    ],
    bodies: {
      'brief-du-jour': '# Brief du jour\n\nTrois gestes pour la journée, lus dans vos onglets.\n\n- Reprendre la note de lancement\n- Comparer les offres\n- Vingt minutes sans bruit',
      'reunion-produit': '# Réunion produit\n\n## Décisions\n\nGarder la vue scindée. Tester le brief avec vingt onglets.\n\n- Relire la note de lancement\n- Envoyer le rapport à l’équipe'
    }
  }

  function viewState() {
    return {
      spaces: mock.spaces,
      tabs: mock.tabs,
      history: mock.history,
      settings: mock.settings,
      active_space: mock.active_space,
      active_tab: mock.active_tab
    }
  }

  function mockTitle(url) {
    return hostOf(url) || 'Nouvel onglet'
  }

  function mockInvoke(cmd, args) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (cmd === 'init') {
          return resolve({
            state: viewState(),
            notes: mock.notes,
            platform: 'macos',
            dataDir: '~/Library/Application Support/Vela Native',
            version: '0.1',
            isolation: 'native'
          })
        }
        if (cmd === 'tab.create') {
          const tab = {
            id: `tab-${Date.now()}`,
            space_id: mock.active_space,
            url: '',
            title: 'Nouvel onglet',
            loading: false,
            can_back: false,
            can_forward: false
          }
          mock.tabs.push(tab)
          mock.active_tab = tab.id
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve({ id: tab.id })
        }
        if (cmd === 'tab.select') {
          mock.active_tab = args.id
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve(null)
        }
        if (cmd === 'tab.close') {
          mock.tabs = mock.tabs.filter((tab) => tab.id !== args.id)
          if (!mock.tabs.length) {
            mock.tabs.push({
              id: `tab-${Date.now()}`,
              space_id: mock.active_space,
              url: '',
              title: 'Nouvel onglet',
              loading: false,
              can_back: false,
              can_forward: false
            })
          }
          mock.active_tab = mock.tabs[mock.tabs.length - 1].id
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve(null)
        }
        if (cmd === 'tab.navigate') {
          const tab = mock.tabs.find((item) => item.id === args.id)
          if (tab) {
            const url = /^https?:/.test(args.url) ? args.url : `https://${args.url}`
            tab.url = url
            tab.title = mockTitle(url)
            tab.can_back = true
            mock.active_tab = tab.id
          }
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve(null)
        }
        if (cmd === 'tab.back' || cmd === 'tab.forward' || cmd === 'tab.reload' || cmd === 'tab.stop') {
          return resolve(null)
        }
        if (cmd === 'space.create') {
          const space = {
            id: `space-${Date.now()}`,
            name: args.name,
            color: args.color,
            store_id: []
          }
          mock.spaces.push(space)
          mock.active_space = space.id
          const tab = {
            id: `tab-${Date.now()}`,
            space_id: space.id,
            url: '',
            title: 'Nouvel onglet',
            loading: false,
            can_back: false,
            can_forward: false
          }
          mock.tabs.push(tab)
          mock.active_tab = tab.id
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve({ id: space.id })
        }
        if (cmd === 'space.select') {
          mock.active_space = args.id
          const tab = mock.tabs.filter((item) => item.space_id === args.id).pop()
          if (tab) mock.active_tab = tab.id
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve(null)
        }
        if (cmd === 'settings.update') {
          if (args.theme) mock.settings.theme = args.theme
          if (typeof args.sidebarCollapsed === 'boolean') mock.settings.sidebar_collapsed = args.sidebarCollapsed
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve(null)
        }
        if (cmd === 'history.clear') {
          mock.history = []
          window.__vela.event({ type: 'state', data: viewState() })
          return resolve(null)
        }
        if (cmd === 'notes.read') {
          return resolve({ body: mock.bodies[args.id] || '' })
        }
        if (cmd === 'notes.save') {
          const id = args.id || String(args.title || 'note').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `note-${Date.now()}`
          mock.bodies[id] = args.body
          const existing = mock.notes.find((note) => note.id === id)
          if (existing) existing.title = args.title
          else mock.notes.unshift({ id, title: args.title, updated_at: Date.now(), excerpt: args.body.slice(0, 90) })
          window.__vela.event({ type: 'notes', data: mock.notes })
          return resolve({ id })
        }
        if (cmd === 'notes.list') return resolve(mock.notes)
        return resolve(null)
      }, 30)
    })
  }
})()
