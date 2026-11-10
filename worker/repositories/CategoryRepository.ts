export interface Category {
  id: string
  name: string
  enabled: boolean
}

interface CategoryRow {
  id: string
  name: string
  enabled: number
}

const toCategory = (row: CategoryRow): Category => ({ id: row.id, name: row.name, enabled: row.enabled === 1 })

/** Thin repository: all SQL for categories lives here (SPEC section 7). */
export class CategoryRepository {
  constructor(private readonly db: D1Database) {}

  /** Enabled genres for the first-run selection and settings (SPEC 2.1). */
  async listEnabledCategories(): Promise<Category[]> {
    const { results } = await this.db
      .prepare('SELECT id, name, enabled FROM categories WHERE enabled = 1 ORDER BY name ASC')
      .all<CategoryRow>()
    return results.map(toCategory)
  }

  /** Every genre including disabled ones; admin use only. */
  async listAllCategories(): Promise<Category[]> {
    const { results } = await this.db
      .prepare('SELECT id, name, enabled FROM categories ORDER BY name ASC')
      .all<CategoryRow>()
    return results.map(toCategory)
  }

  async createCategory(category: { id: string; name: string; enabled: boolean; now: string }): Promise<void> {
    await this.db
      .prepare('INSERT INTO categories (id, name, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)')
      .bind(category.id, category.name, category.enabled ? 1 : 0, category.now)
      .run()
  }

  async updateCategory(id: string, patch: { name?: string; enabled?: boolean; now: string }): Promise<boolean> {
    const sets: string[] = []
    const params: unknown[] = []
    if (patch.name !== undefined) { sets.push(`name = ?${params.length + 1}`); params.push(patch.name) }
    if (patch.enabled !== undefined) { sets.push(`enabled = ?${params.length + 1}`); params.push(patch.enabled ? 1 : 0) }
    sets.push(`updated_at = ?${params.length + 1}`); params.push(patch.now)
    params.push(id)
    const result = await this.db
      .prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?${params.length}`)
      .bind(...params)
      .run()
    return (result.meta?.changes ?? 0) > 0
  }

  async deleteCategory(id: string): Promise<boolean> {
    await this.db.prepare('DELETE FROM video_categories WHERE category_id = ?1').bind(id).run()
    const result = await this.db.prepare('DELETE FROM categories WHERE id = ?1').bind(id).run()
    return (result.meta?.changes ?? 0) > 0
  }
}
