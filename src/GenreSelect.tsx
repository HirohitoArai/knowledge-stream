import type { CategoryDto } from '../shared/api'

/**
 * Genre multi-select (SPEC section 2.1). Used by the first-run gate and by
 * the profile tab for later changes; purely controlled — the parent owns
 * the selection and decides when to save it.
 */
export function GenreSelect({ categories, selected, onToggle }: {
  categories: CategoryDto[]
  selected: ReadonlySet<string>
  onToggle: (categoryId: string) => void
}) {
  return <div className="genre-grid" role="group" aria-label="ジャンル選択">
    {categories.map(category => {
      const isSelected = selected.has(category.id)
      return <button
        key={category.id}
        type="button"
        className="genre-chip"
        aria-pressed={isSelected}
        onClick={() => onToggle(category.id)}
      >
        {isSelected ? '✓ ' : ''}{category.name}
      </button>
    })}
  </div>
}
