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
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action?.run()
                useBrowser.setState((state) => ({
                  toasts: state.toasts.filter((item) => item.id !== toast.id)
                }))
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
