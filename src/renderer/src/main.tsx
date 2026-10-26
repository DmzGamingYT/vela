import { createRoot } from 'react-dom/client'
import App from './App'
import { applyCachedAppearance } from './lib/appearance'
import './styles.css'

// Le script d'index.html a déjà posé le thème mémorisé ; ce second passage
// couvre les lancements où le stockage était vide ou partiel.
applyCachedAppearance()

const container = document.getElementById('root')
if (!container) throw new Error('Racine introuvable')

createRoot(container).render(<App />)
