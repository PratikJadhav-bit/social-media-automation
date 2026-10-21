import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const brands = sqliteTable("brands", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  settings: text("settings").notNull(),
});
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  title: text("title").notNull(),
  format: text("format").notNull(),
  language: text("language").notNull(),
  status: text("status").notNull(),
  script: text("script"),
  assets: text("assets"),
  checks: text("checks"),
  scheduledAt: integer("scheduled_at"),
  createdAt: integer("created_at").notNull(),
});
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    postId: text("post_id").references(() => posts.id),
    stage: text("stage").notNull(),
    key: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    runAt: integer("run_at").notNull(),
    lockedAt: integer("locked_at"),
    error: text("error"),
    payload: text("payload").notNull().default("{}"),
  },
  (t) => [uniqueIndex("jobs_key").on(t.key)],
);
export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    platform: text("platform").notNull(),
    accountId: text("account_id").notNull(),
    token: text("token"),
    mode: text("mode").notNull(),
  },
  (t) => [uniqueIndex("connection_platform").on(t.brandId, t.platform)],
);
export const publications = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    platform: text("platform").notNull(),
    externalId: text("external_id"),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    publishedAt: integer("published_at"),
  },
  (t) => [uniqueIndex("publication_platform").on(t.postId, t.platform)],
);
export const metrics = sqliteTable(
  "metrics",
  {
    id: text("id").primaryKey(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id),
    day: text("day").notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
    shares: integer("shares").notNull(),
    watchSeconds: integer("watch_seconds").notNull(),
  },
  (t) => [uniqueIndex("metrics_day").on(t.publicationId, t.day)],
);
export const usage = sqliteTable(
  "usage",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    day: text("day").notNull(),
    units: integer("units").notNull(),
  },
  (t) => [uniqueIndex("usage_day").on(t.provider, t.day)],
);
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  platform: text("platform").notNull(),
  body: text("body").notNull(),
  draft: text("draft").notNull(),
  status: text("status").notNull(),
});
