import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function Toasts() {
  const toasts = useBrowser((state) => state.toasts)

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone}>
          <Icon name={toast.tone === 'error' ? 'warning' : 'check'} size={14} />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  )
}
