import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const aiQuota = sqliteTable('ai_quota', {
  bucket: text('bucket').primaryKey(),
  used: integer('used').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
});
