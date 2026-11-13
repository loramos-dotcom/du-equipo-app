import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const demoWorkspaces=sqliteTable('demo_workspaces',{id:text('id').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull()});
