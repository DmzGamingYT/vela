/*
 * Tournage de la bande-annonce de Vela.
 *
 * Un seul plan-séquence, capturé au niveau du système sur la seule fenêtre de
 * l'app : les pages web (vues natives) sont donc filmées pour de vrai, et rien
 * du bureau n'entre dans l'image.
 *
 *   node site/trailer/record.cjs
 *
 * Sortie : site/trailer/take/screen.mov, take/timeline.json.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { launchApp, makeInputs, sleep, attachPage } = require('./lib.cjs')

const TAKE = path.join(__dirname, 'take')
const WINDOW_JSON = path.join(TAKE, 'window.json')
const VIDEO = path.join(TAKE, 'screen.mov')
/* Durée d'enregistrement : le scénario fait ~42 s, on garde de la marge. */
const SECONDS = 50
/* NODE_OPTIONS ne protège pas les espaces : copie dans un chemin neutre. */
const INJECT = path.join(os.tmpdir(), 'vela-trailer-inject.cjs')

/* Démonstration : marque-pages, notes liées et tâches crédibles. */
const SEED = `(async () => {
  const vela = window.vela
  await vela.settings.update({ onboarded: true, theme: 'dark' })

  await vela.bookmarks.addMany([
    { url: 'https://developer.mozilla.org/fr/', title: 'MDN — documentation web' },
    { url: 'https://arxiv.org/', title: 'arXiv' },
    { url: 'https://news.ycombinator.com/', title: 'Hacker News' },
    { url: 'https://fr.wikipedia.org/', title: 'Wikipédia' }
  ])

  await vela.notes.save({
    title: 'Hébergement statique',
    body: [
      '# Hébergement statique',
      '',
      'Un site de vitrine n’a pas besoin d’un serveur applicatif : des fichiers',
      'et un CDN suffisent, et la facture reste proche de zéro.',
      '',
      'À comparer dans [[Tunnel de recherche]] : coût, temps de mise en ligne,',
      'et ce qu’on perd en observabilité.'
    ].join('\\n'),
    tags: ['veille', 'hébergement'],
    pinned: true
  })
  await vela.notes.save({
    title: 'Tunnel de recherche',
    body: [
      'Grille de lecture : sources réelles, pertinence affichée, tensions citées.',
      '',
      'Voir aussi [[Hébergement statique]] pour les chiffres.'
    ].join('\\n'),
    tags: ['méthode']
  })

  await vela.tasks.create({ title: 'Comparer trois hébergeurs' })
  await vela.tasks.create({ title: 'Relire le brief de lundi' })

  return true
})()`

const marks = []

;(async () => {
  fs.rmSync(TAKE, { recursive: true, force: true })
  fs.mkdirSync(TAKE, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'inject.cjs'), INJECT)

  const app = await launchApp({
    dataDir: path.join(__dirname, '.record-data'),
    seed: SEED,
    resize: false,
    extraEnv: {
      NODE_OPTIONS: `--require ${INJECT}`,
      VELA_WINDOW_JSON: WINDOW_JSON
    }
  })
  const input = makeInputs(app.client)
  /* Taille réellement obtenue, une fois la fenêtre bornée à l'écran : c'est
     elle qui définit la région capturée et le repère des coordonnées. */
  let width = app.width
  let height = app.height

  let recorder = null
  let recorderExit = null
  let videoStart = null
  try {
    // La fenêtre annonce sa position une fois posée : c'est aussi l'instant à
    // partir duquel elle est au premier plan.
    let geometry = null
    for (let i = 0; i < 200 && !geometry; i += 1) {
      if (fs.existsSync(WINDOW_JSON)) {
        geometry = JSON.parse(fs.readFileSync(WINDOW_JSON, 'utf8'))
        if (geometry.error || !geometry.content) throw new Error(geometry.error || 'géométrie absente')
      } else {
        await sleep(100)
      }
    }
    if (!geometry) throw new Error('la fenêtre ne s’est jamais déclarée')
    width = geometry.content.width
    height = geometry.content.height
    console.log('fenêtre :', JSON.stringify(geometry.content), 'échelle', geometry.scale)

    await sleep(1800) // l'accueil finit ses animations avant la première image
    videoStart = Date.now()
    recorder = spawn(
      'screencapture',
      [
        '-v',
        '-V',
        String(SECONDS),
        '-x',
        // Curseur et surbrillance des clics : l'action devient lisible.
        '-C',
        '-k',
        '-R',
        `${geometry.content.x},${geometry.content.y},${width},${height}`,
        VIDEO
      ],
      { stdio: 'ignore' }
    )
    recorder.once('exit', (code) => {
      recorderExit = code ?? 0
    })
    // `screencapture` met quelques dixièmes de seconde à démarrer réellement :
    // on laisse passer ce délai avant de compter le temps du scénario.
    await sleep(400)
    const t0 = Date.now()
    const mark = (label) => {
      marks.push({ label, at: Number(((Date.now() - t0) / 1000).toFixed(2)) })
      console.log(`  ${marks[marks.length - 1].at.toFixed(2)} s — ${label}`)
    }
    mark('accueil')

    // 1. Accueil : la souris entre dans le champ, la question s'écrit.
    await input.click(width * 0.55, 296, { pause: 260 })
    await input.type('hébergement statique pas cher', { perChar: 42 })
    await sleep(900)
    mark('saisie')

    // 2. Une vraie adresse, une vraie page. On ouvre depuis la barre d'adresse
    //    plutôt que depuis un moteur : aucune publicité tierce ne se retrouve
    //    dans la bande-annonce.
    await input.clickSelector('.address-input', { pause: 320 })
    await input.type('fr.wikipedia.org/wiki/Hébergeur_web', { perChar: 26 })
    await sleep(420)
    await input.key('Enter', [], { pause: 400 })
    mark('adresse')
    await sleep(2600)
    mark('page')
    const wiki = await attachPage(app.port, /fr\.wikipedia\.org/, 7000)
    if (wiki) {
      await wiki.wheel(width * 0.5, height * 0.55, 7, 190, 90)
      await sleep(800)
    }
    mark('défilement')

    // 3. Vue scindée : la page de gauche reste, la documentation arrive à droite.
    const docs = await input.evaluate(`window.vela.tabs.create({ url: 'https://developer.mozilla.org/fr/docs/Learn' })`)
    await sleep(2200)
    if (docs?.id) await input.evaluate(`window.vela.tabs.splitSet(${JSON.stringify(docs.id)})`)
    await sleep(2600)
    mark('scindé')

    // 4. Notes : ⌘E appartient au menu macOS, qui ne voit pas nos touches — on
    //    clique donc le bouton du rail, le vrai chemin de l'interface.
    await input.clickSelector('.rail-ghost', { index: 0, pause: 700 })
    await sleep(1500)
    await input.hoverSelector('.notes-drawer li, .notes-drawer article, .notes-drawer button', 0).catch(() => {})
    await sleep(1300)
    mark('notes')
    await input.clickSelector('.rail-ghost', { index: 0, pause: 500 })

    // 5. Mode Travail : le tunnel se construit à partir d'une requête tapée.
    await input.clickSelector('.rail-mode', { index: 1, pause: 800 })
    await sleep(1400)
    mark('travail')
    await input.clickSelector('input[placeholder="Un sujet, une question, un angle"]', { pause: 400 })
    await input.type('hébergement d’un site vitrine', { perChar: 36 })
    await sleep(520)
    mark('requête')
    await input.key('Enter', [], { pause: 900 })
    // Filet de sécurité : si la touche n'a pas lancé la recherche, on clique le
    // bouton « Explorer » — c'est le même chemin, en visible à l'image.
    await sleep(1500)
    const launched = await input.evaluate(`document.querySelectorAll('.tunnel-node').length`)
    if (!launched) await input.clickSelector('.tunnel-run', { pause: 900 }).catch(() => {})
    // La carte se remplit en direct : on attend qu'elle ait de quoi se voir.
    for (let i = 0; i < 60; i += 1) {
      const nodes = await input.evaluate(`document.querySelectorAll('.tunnel-node').length`)
      if (nodes >= 6) break
      await sleep(700)
    }
    await sleep(1600)
    mark('tunnel')

    // 6. Le détail d'une source : la carte dit d'où elle vient.
    await input.clickSelector('.tunnel-node[data-kind="site"]', { index: 0, pause: 900 }).catch(() => {})
    await sleep(2400)
    await input.glide({ x: width * 0.72, y: height * 0.42 }, { x: width * 0.6, y: height * 0.58 }, 22, 22)
    await sleep(700)
    mark('détail')

    // 7. Le sélecteur de niveau replie la carte : les titres redeviennent lisibles.
    await input.clickSelector('.tunnel-levels button', { index: 1, pause: 900 }).catch(() => {})
    await sleep(2200)
    mark('niveaux')
  } catch (error) {
    console.error('ÉCHEC pendant le tournage :', error.message)
  } finally {
    // On laisse la capture se terminer d'elle-même : la tuer tronquerait le
    // fichier. Mais si elle s'est déjà arrêtée, on n'attend pas un événement
    // qui ne reviendra jamais.
    if (recorder && recorderExit === null) {
      await Promise.race([
        new Promise((resolve) => recorder.once('exit', resolve)),
        sleep(25000)
      ])
    }
    try {
      app.client.close()
    } catch {
      /* la connexion est peut-être déjà fermée */
    }
    app.close()
    fs.writeFileSync(path.join(TAKE, 'timeline.json'), JSON.stringify({ videoStart, marks }, null, 2))
    console.log('vidéo :', VIDEO)
  }
})()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('ÉCHEC', error.message)
    process.exit(1)
  })
