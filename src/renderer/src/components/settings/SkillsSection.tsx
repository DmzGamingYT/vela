import { useState } from 'react'
import { normalizeSkillCommand, SKILL_LIMIT } from '@shared/skills'
import type { Skill } from '@shared/types'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/**
 * Trois commandes proposées, prêtes à ajouter : personne ne devine quelle
 * phrase écrire pour sa première skill. Elles disparaissent dès qu'elles sont
 * dans la liste, et ne remplacent jamais une commande existante.
 */
const PROPOSALS: { command: string; label: string; prompt: string }[] = [
  {
    command: 'traduire',
    label: 'Traduire la page dans ma langue',
    prompt:
      'Traduis le contenu principal de la page de l’onglet joint dans ma langue, en gardant les titres et les liens importants.'
  },
  {
    command: 'plan',
    label: 'Tirer un plan de la page',
    prompt:
      'Extrais un plan hiérarchisé de la page de l’onglet joint : sections, idées clés et ce qu’il faut lire en premier.'
  },
  {
    command: 'veille',
    label: 'Comparer les offres de la page',
    prompt:
      'Compare les offres présentées dans la page de l’onglet joint : prix, ce qui est inclus, et celle qui convient pour un usage simple.'
  }
]

interface Draft {
  /** `null` : une nouvelle skill ; sinon l’identifiant de celle qu’on modifie. */
  id: string | null
  command: string
  label: string
  prompt: string
}

/**
 * Skills : les commandes `/` que l’utilisateur écrit lui-même.
 *
 * Elles sont nées dans le code, avec quatre gestes figés ; ce sont maintenant
 * des données du profil, au même titre que les moteurs de recherche. La palette
 * les lit ici, donc ajouter une skill ne demande pas de toucher au code.
 */
export default function SkillsSection() {
  const settings = useBrowser((state) => state.view?.settings)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const toast = useBrowser((state) => state.toast)
  const [draft, setDraft] = useState<Draft | null>(null)

  const skills = settings?.skills ?? []

  const startNew = (): void => setDraft({ id: null, command: '', label: '', prompt: '' })

  const startEdit = (skill: Skill): void =>
    setDraft({
      id: skill.id,
      command: skill.command,
      label: skill.label,
      prompt: skill.prompt
    })

  const save = async (): Promise<void> => {
    if (!draft) return
    const command = normalizeSkillCommand(draft.command)
    const prompt = draft.prompt.trim()
    if (!command) {
      toast('Il faut un nom après la barre — par exemple /résumer', 'error')
      return
    }
    if (!prompt) {
      toast('Une skill sans instruction n’enverrait rien à l’agent.', 'error')
      return
    }
    const id = draft.id ?? `skill-${command}`
    if (skills.some((skill) => skill.command === command && skill.id !== id)) {
      toast(`/${command} existe déjà`, 'error')
      return
    }
    const entry: Skill = {
      id,
      command,
      label: draft.label.trim() || command,
      prompt
    }
    const next = draft.id
      ? skills.map((skill) => (skill.id === id ? entry : skill))
      : [...skills, entry]
    if (next.length > SKILL_LIMIT) {
      toast(`${SKILL_LIMIT} skills au maximum`, 'error')
      return
    }
    await updateSettings({ skills: next })
    setDraft(null)
    toast(draft.id ? `/${command} mise à jour` : `/${command} ajoutée`)
  }

  const remove = async (skill: Skill): Promise<void> => {
    await updateSettings({ skills: skills.filter((item) => item.id !== skill.id) })
    if (draft?.id === skill.id) setDraft(null)
    toast(`/${skill.command} retirée`)
  }

  /** Une proposition s'ajoute d'un clic, sans passer par le formulaire. */
  const propose = async (proposal: (typeof PROPOSALS)[number]): Promise<void> => {
    if (skills.length >= SKILL_LIMIT) {
      toast(`${SKILL_LIMIT} skills au maximum`, 'error')
      return
    }
    const entry: Skill = {
      id: `skill-${proposal.command}`,
      command: proposal.command,
      label: proposal.label,
      prompt: proposal.prompt
    }
    await updateSettings({ skills: [...skills, entry] })
    toast(`/${proposal.command} ajoutée`)
  }

  const proposals = PROPOSALS.filter(
    (proposal) => !skills.some((skill) => skill.command === proposal.command)
  )

  return (
    <section className="setting-block" data-settings-anchor="agent-skills">
      <div className="setting-head">
        <h2>Skills</h2>
        <p>
          Des commandes « / » qui préparent une demande pour l’agent. Tapez « / » dans la palette
          pour les retrouver.
        </p>
      </div>

      {skills.length === 0 && !draft && (
        <p className="setting-hint">
          Aucune skill. Une phrase suffit : « /veille » qui compare trois offres, « /notes » qui
          range la page en trois lignes.
        </p>
      )}

      {proposals.length > 0 && (
        <div className="skill-proposals">
          <span className="skill-proposals-title">Proposées</span>
          <div className="skill-proposals-list">
            {proposals.map((proposal) => (
              <button
                type="button"
                className="skill-chip"
                key={proposal.command}
                onClick={() => void propose(proposal)}
                title={`Ajouter /${proposal.command} — ${proposal.label}`}
                disabled={skills.length >= SKILL_LIMIT}
              >
                <span>/{proposal.command}</span>
                {proposal.label}
                <Icon name="plus" size={11} />
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="skills-list">
        {skills.map((skill) => (
          <li
            key={skill.id}
            className="skill-row"
            data-editing={draft?.id === skill.id ? 'true' : undefined}
          >
            <div className="skill-copy">
              <span className="skill-command">/{skill.command}</span>
              <span className="skill-label">{skill.label}</span>
            </div>
            <div className="skill-actions">
              <button
                type="button"
                className="action ghost"
                onClick={() => startEdit(skill)}
                title="Modifier"
                aria-label={`Modifier /${skill.command}`}
              >
                <Icon name="edit" size={13} />
              </button>
              <button
                type="button"
                className="action ghost danger"
                onClick={() => void remove(skill)}
                title="Retirer"
                aria-label={`Retirer /${skill.command}`}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {draft ? (
        <div className="skill-editor">
          <div className="field-grid">
            <label className="field">
              <span>Commande</span>
              <input
                value={draft.command}
                onChange={(event) => setDraft({ ...draft, command: event.target.value })}
                placeholder="résumer"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Titre</span>
              <input
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                placeholder="Résumer la page en trois points"
              />
            </label>
          </div>
          <label className="field">
            <span>Instruction envoyée à l’agent</span>
            <textarea
              value={draft.prompt}
              onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
              rows={3}
              placeholder="Résume la page de l’onglet joint en trois points, puis dis ce qu’il faut retenir."
            />
          </label>
          <div className="model-editor-actions">
            <button type="button" className="action ghost" onClick={() => setDraft(null)}>
              Annuler
            </button>
            <button type="button" className="action primary" onClick={() => void save()}>
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="action wide"
          onClick={startNew}
          disabled={skills.length >= SKILL_LIMIT}
        >
          <Icon name="plus" size={13} />
          Nouvelle skill
        </button>
      )}
    </section>
  )
}
