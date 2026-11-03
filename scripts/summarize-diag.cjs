/* Aide-mémoire : résume le journal d'un passage du harnais de diagnostic. */
const fs = require('node:fs')
const file = process.argv[2] || '/tmp/diag.log'
const raw = fs.readFileSync(file, 'utf8')
const lines = raw.split(/\r?\n/)
const show = (label, match, limit = 8) => {
  const hits = lines.filter((line) => match.test(line))
  console.log(`\n=== ${label} (${hits.length}) ===`)
  for (const line of hits.slice(0, limit)) console.log(line.slice(0, 500))
}
show('HARNAIS', /harnais/)
show('MAIN', /\[main\]/)
show('BD', /\[BD\]/)
show('ERREURS', /inaccessible|ignorée|exception|error/i, 12)
console.log('\n=== FICHIER ===', file)