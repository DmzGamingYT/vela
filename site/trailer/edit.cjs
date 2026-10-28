/*
 * Montage de la bande-annonce de Vela.
 *
 *   node site/trailer/edit.cjs
 *
 * Entrées  : site/trailer/take/screen.mov (capture réelle de la fenêtre),
 *            site/trailer/take/sound.wav  (bande-son synthétisée),
 *            site/trailer/take/timeline.json (repères du tournage).
 * Sorties  : site/public/media/vela-trailer.{mp4,webm,jpg,vtt}
 *
 * La vidéo est un plan-séquence : on coupe juste après la dernière action,
 * avec un fondu au noir et un fondu sonore. Aucun outil externe : ffmpeg seul.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TAKE = path.join(__dirname, 'take')
const OUT = path.join(__dirname, '..', 'public', 'media')
const VIDEO = path.join(TAKE, 'screen.mov')
const SOUND = path.join(TAKE, 'sound.wav')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

/* La capture démarre quelques dixièmes de seconde après le début du scénario. */
const OFFSET = 0.42
const WIDTH = 1440
const HEIGHT = 900

/* Légendes : chaque phrase est posée entre deux repères du tournage, donc elle
   reste juste même si le scénario change de rythme. */
const CAPTIONS = [
  ['accueil', 'saisie', 'Un navigateur, des espaces : chaque profil garde ses onglets, ses favoris et ses notes'],
  ['saisie', 'adresse', 'La question s’écrit dans la page d’accueil, sans quitter l’espace de travail'],
  ['adresse', 'page', 'Une adresse, et la page réelle s’affiche'],
  ['page', 'scindé', 'Défilement réel : c’est bien le site que l’on voit, pas une maquette'],
  ['scindé', 'notes', 'Vue scindée : la documentation à gauche, la page à droite'],
  ['notes', 'travail', 'Notes liées, extraits, mémoire de l’espace'],
  ['requête', 'tunnel', 'Tunnel de recherche : angles, sous-angles, puis sources réelles'],
  ['tunnel', 'détail', 'Chaque carte pointe vers une page réellement récupérée'],
  ['détail', 'niveaux', 'Pertinence, confiance et extraits, pour chaque source'],
  ['niveaux', null, 'Vela — le navigateur de travail']
]

const run = (args) => execFileSync(FFMPEG, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
const stamp = (seconds) => {
  const value = Math.max(0, seconds)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  const millis = Math.round((value - Math.floor(value)) * 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

const main = () => {
  const timeline = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'))
  const at = (label) => {
    const mark = timeline.marks.find((item) => item.label === label)
    return mark ? Number((mark.at + OFFSET).toFixed(2)) : null
  }
  const last = at('niveaux') ?? at('détail') ?? 40
  /* Fin : la carte reste visible un instant après la dernière action. */
  const duration = Number((last + 3.2).toFixed(2))
  const fadeOut = Number((duration - 1.2).toFixed(2))

  fs.mkdirSync(OUT, { recursive: true })
  const mp4 = path.join(OUT, 'vela-trailer.mp4')
  const webm = path.join(OUT, 'vela-trailer.webm')
  const poster = path.join(OUT, 'vela-trailer.jpg')
  const vtt = path.join(OUT, 'vela-trailer.vtt')

  const picture = [
    `scale=${WIDTH}:${HEIGHT}:flags=lanczos`,
    'fade=t=in:st=0:d=0.45',
    `fade=t=out:st=${fadeOut}:d=1.2`
  ].join(',')

  /* MP4 : H.264 + AAC, lisible partout, index déplacé en tête pour la lecture
     immédiate dans le navigateur. */
  run([
    '-i', VIDEO,
    '-i', SOUND,
    '-t', String(duration),
    '-vf', picture,
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    mp4
  ])
  console.log('écrit', mp4)

  /* WebM : second format pour les navigateurs qui préfèrent VP9. */
  run([
    '-i', VIDEO,
    '-i', SOUND,
    '-t', String(duration),
    '-vf', picture,
    '-r', '30',
    '-c:v', 'libvpx-vp9',
    '-crf', '34',
    '-b:v', '0',
    '-row-mt', '1',
    '-cpu-used', '2',
    '-c:a', 'libopus',
    '-b:a', '128k',
    webm
  ])
  console.log('écrit', webm)

  /* Vignette : l'accueil, la question déjà écrite — lisible même en petit. */
  const posterAt = Math.max(1.4, (at('saisie') ?? 4) - 0.6)
  run(['-ss', String(posterAt + 0.6), '-i', VIDEO, '-frames:v', '1', '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos`, '-q:v', '3', poster])
  console.log('écrit', poster)

  /* Légendes, calées sur les repères du tournage. */
  const lines = ['WEBVTT', '']
  for (const [from, to, text] of CAPTIONS) {
    const start = at(from)
    if (start === null) continue
    const stop = to === null ? duration : Math.min(at(to) ?? duration, duration)
    if (stop <= start) continue
    lines.push(`${stamp(start)} --> ${stamp(stop)}`)
    lines.push(text)
    lines.push('')
  }
  fs.writeFileSync(vtt, `${lines.join('\n')}\n`)
  console.log('écrit', vtt, `(${CAPTIONS.length} légendes)`)

  console.log(`durée finale ${duration} s — fondu sortant à ${fadeOut} s`)
}

main()
