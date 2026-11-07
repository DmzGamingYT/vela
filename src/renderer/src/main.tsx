import { createRoot } from 'react-dom/client'
import App from './App'
import { applyCachedAppearance } from './lib/appearance'
import './styles.css'

// Le script d'index.html a déjà posé le thème mémorisé ; ce second passage
// couvre les lancements où le stockage était vide ou partiel.
applyCachedAppearance()

// Fenêtre au second plan : l'aurora de l'accueil se met en pause, et reprend
// au retour. Une dérive plein écran à 60 im/s coûtait ~45 % d'un cœur.
const syncWindowFocus = (): void => {
  document.documentElement.dataset.windowFocus = document.hasFocus() ? 'true' : 'false'
}
syncWindowFocus()
window.addEventListener('focus', syncWindowFocus)
window.addEventListener('blur', syncWindowFocus)

const container = document.getElementById('root')
if (!container) throw new Error('Racine introuvable')

createRoot(container).render(<App />)
