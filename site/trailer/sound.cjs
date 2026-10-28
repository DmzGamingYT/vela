/*
 * Bande-son de la bande-annonce.
 *
 * Tout est synthétisé par ffmpeg à partir de la chronologie du tournage : pas
 * de musique sous licence, pas de fichier tiers. On obtient un lit sonore
 * discret, une impulsion sur chaque étape, le bruit des frappes, une montée
 * avant le tunnel et un accord de fin.
 *
 *   node site/trailer/sound.cjs
 *
 * Sortie : site/trailer/take/sound.wav (48 kHz, stéréo), alignée sur l'image.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TAKE = path.join(__dirname, 'take')
const AUDIO = path.join(TAKE, 'audio')
const SOUND = path.join(TAKE, 'sound.wav')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

/* La capture démarre quelques dixièmes de seconde après le début du scénario. */
const OFFSET = 0.42
/* Étapes qui reçoivent une impulsion, dans l'ordre de la gamme. */
const STEPS = ['saisie', 'page', 'scindé', 'notes', 'travail', 'requête', 'tunnel', 'détail', 'niveaux']
const NOTES = [523.25, 587.33, 659.25, 587.33, 698.46, 659.25, 783.99, 880, 1046.5]

const run = (args) => execFileSync(FFMPEG, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
const ms = (seconds) => Math.max(0, Math.round(seconds * 1000))

const main = () => {
  const timeline = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'))
  const at = (label) => {
    const mark = timeline.marks.find((item) => item.label === label)
    return mark ? mark.at + OFFSET : null
  }
  const end = Number(((at('niveaux') ?? 40) + 3.4).toFixed(2))

  fs.rmSync(AUDIO, { recursive: true, force: true })
  fs.mkdirSync(AUDIO, { recursive: true })

  /* 1. Lit sonore : deux sinusoïdes basses qui respirent, plus un souffle très
     filtré pour éviter le silence numérique. */
  const bed = path.join(AUDIO, 'bed.wav')
  run([
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${end}`,
    '-f', 'lavfi', '-i', `sine=frequency=164.81:duration=${end}`,
    '-f', 'lavfi', '-i', `anoisesrc=duration=${end}:color=pink:amplitude=0.6`,
    '-filter_complex',
    [
      '[0:a]tremolo=f=0.11:d=0.6,volume=0.045[a]',
      '[1:a]tremolo=f=0.1:d=0.7,volume=0.026[b]',
      '[2:a]lowpass=f=520,volume=0.055[c]',
      `[a][b][c]amix=inputs=3:normalize=0,afade=t=in:d=1.4,afade=t=out:st=${(end - 1.8).toFixed(2)}:d=1.8[out]`
    ].join(';'),
    '-map', '[out]', '-ar', '48000', '-ac', '2', bed
  ])

  /* 2. Frappes de clavier : une impulsion courte toutes les 47 ms pendant les
     deux moments où une requête s'écrit. */
  const typing = [
    { start: (at('accueil') ?? 0) + 0.5, stop: (at('saisie') ?? 3) - 1.0 },
    { start: (at('travail') ?? 24) + 0.5, stop: (at('requête') ?? 26) - 0.55 }
  ].filter((window) => window.stop > window.start + 0.2)

  const ticks = typing.map((window, index) => {
    const file = path.join(AUDIO, `ticks-${index + 1}.wav`)
    const duration = Number((window.stop - window.start).toFixed(2))
    const delay = ms(window.start)
    run([
      '-f', 'lavfi', '-i', `aevalsrc=sin(2*PI*1900*t)*exp(-70*mod(t\\,0.047))*0.5:s=48000:d=${duration}`,
      '-af', `volume=0.1,highpass=f=250,lowpass=f=7000,adelay=${delay}|${delay}`,
      '-ar', '48000', '-ac', '2', file
    ])
    return file
  })

  /* 3. Impulsions d'étape : une note claire doublée à l'octave basse, placée à
     l'instant exact où l'image change. */
  const chimes = path.join(AUDIO, 'chimes.wav')
  const chimeInputs = []
  const chimeFilter = []
  /* Une entrée par note : l'indice du flux et le nom de l'étiquette avancent
     ensemble, sinon le mélange perd une sortie. */
  let chimeCount = 0
  STEPS.forEach((step, index) => {
    const time = at(step)
    if (time === null) return
    const frequency = NOTES[index % NOTES.length]
    for (const [tone, volume] of [[frequency, 0.07], [frequency / 4, 0.05]]) {
      const id = chimeCount++
      chimeInputs.push('-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=1.9`)
      chimeFilter.push(
        `[${id}:a]afade=t=in:st=0:d=0.015,afade=t=out:st=0.03:d=1.85,` +
          `volume=${volume},adelay=${ms(time)}|${ms(time)}[c${id}]`
      )
    }
  })
  chimeFilter.push(`[${Array.from({ length: chimeCount }, (_, i) => `c${i}`).join('][')}]amix=inputs=${chimeCount}:normalize=0[out]`)
  run([...chimeInputs, '-filter_complex', chimeFilter.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', chimes])

  /* 4. Montée avant le tunnel : un souffle qui grandit, coupé net à l'arrivée. */
  const sweep = path.join(AUDIO, 'sweep.wav')
  const sweepStart = (at('requête') ?? 26) + 0.35
  const sweepDuration = Math.max(2, (at('tunnel') ?? 32) - sweepStart)
  const ramp = Number((sweepDuration * 0.88).toFixed(2))
  run([
    '-f', 'lavfi', '-i', `anoisesrc=duration=${sweepDuration.toFixed(2)}:color=white:amplitude=0.5`,
    '-af',
    `highpass=f=420,lowpass=f=5200,afade=t=in:st=0:d=${ramp},afade=t=out:st=${ramp}:d=${(sweepDuration - ramp).toFixed(2)},volume=0.18,adelay=${ms(sweepStart)}|${ms(sweepStart)}`,
    '-ar', '48000', '-ac', '2', sweep
  ])

  /* 5. Accord de fin, tenu puis effacé sous le fondu de l'image. */
  const outro = path.join(AUDIO, 'outro.wav')
  const outroStart = at('niveaux') ?? end - 3.4
  run([
    '-f', 'lavfi', '-i', 'sine=frequency=392:duration=3.2',
    '-f', 'lavfi', '-i', 'sine=frequency=523.25:duration=3.2',
    '-f', 'lavfi', '-i', 'sine=frequency=659.25:duration=3.2',
    '-filter_complex',
    [
      '[0:a]volume=0.05[a]',
      '[1:a]volume=0.04[b]',
      '[2:a]volume=0.03[c]',
      `[a][b][c]amix=inputs=3:normalize=0,afade=t=in:st=0:d=0.9,afade=t=out:st=0.7:d=2.3,adelay=${ms(outroStart)}|${ms(outroStart)}[out]`
    ].join(';'),
    '-map', '[out]', '-ar', '48000', '-ac', '2', outro
  ])

  /* 6. Mélange final : rien ne doit saturer, le niveau moyen est normalisé. */
  const inputs = [bed, ...ticks, chimes, sweep, outro]
  run([
    ...inputs.flatMap((file) => ['-i', file]),
    '-filter_complex',
    `${inputs.map((_, index) => `[${index}:a]`).join('')}amix=inputs=${inputs.length}:normalize=0,` +
      `alimiter=limit=0.9:level=false,loudnorm=I=-18:TP=-2:LRA=11,` +
      `afade=t=out:st=${(end - 1.2).toFixed(2)}:d=1.2[out]`,
    '-map', '[out]', '-ar', '48000', '-ac', '2', SOUND
  ])

  console.log(`bande-son : ${SOUND}`)
  console.log(`  durée ${end} s — ${STEPS.filter((step) => at(step) !== null).length} impulsions, ${typing.length} plages de frappe`)
}

main()
