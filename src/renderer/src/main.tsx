import { createRoot } from 'react-dom/client'
import App from './App'
import MiniBar from './components/MiniBar'
import { applyCachedAppearance } from './lib/appearance'
import './styles.css'

// Le script d'index.html a déjà posé le thème mémorisé ; ce second passage
// couvre les lancements où le stockage était vide ou partiel.
applyCachedAppearance()

const container = document.getElementById('root')
if (!container) throw new Error('Racine introuvable')

// Même bundle, deux fenêtres : la petite fenêtre (« Little Arc ») n'affiche que
// sa barre compacte, la page vivant dans une vue native posée juste dessous.
const mini = new URLSearchParams(window.location.search).has('mini')

createRoot(container).render(mini ? <MiniBar /> : <App />)
