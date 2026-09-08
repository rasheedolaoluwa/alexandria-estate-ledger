import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const imports = sqliteTable('imports', { id: text('id').primaryKey(), payload: text('payload').notNull(), importedAt: text('imported_at').notNull() });
export const entries = sqliteTable('entries', { id: text('id').primaryKey(), kind: text('kind').notNull(), payload: text('payload').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull() });
export const recorders = sqliteTable('recorders', { email: text('email').primaryKey(), createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull() });
