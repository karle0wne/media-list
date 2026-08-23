import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { EXTERNAL_SOURCES, MEDIA_STATUSES, MEDIA_TYPES, METADATA_STATUSES } from "../lib/types";

// Local users are data owners only. Authentication, access policy, sessions and
// revocation live at the trusted gateway boundary outside media-list.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email"),
  externalSubject: text("external_subject"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, table => [
  uniqueIndex("users_username_uq").on(table.username),
  uniqueIndex("users_email_uq").on(table.email),
  uniqueIndex("users_external_subject_uq").on(table.externalSubject),
]);

export const media=sqliteTable("media",{id:text("id").primaryKey(),type:text("type",{enum:MEDIA_TYPES}).notNull(),title:text("title").notNull(),originalTitle:text("original_title"),romanizedTitle:text("romanized_title"),year:integer("year"),externalSource:text("external_source",{enum:EXTERNAL_SOURCES}).notNull(),externalId:text("external_id").notNull(),externalSubId:text("external_sub_id").notNull().default(""),externalUrl:text("external_url"),coverUrl:text("cover_url"),metadataStatus:text("metadata_status",{enum:METADATA_STATUSES}).notNull().default("READY"),metadataError:text("metadata_error"),metadataRefreshedAt:integer("metadata_refreshed_at",{mode:"timestamp_ms"})},table=>[uniqueIndex("media_external_identity_uq").on(table.externalSource,table.externalId,table.externalSubId),index("media_type_idx").on(table.type),index("media_metadata_refresh_idx").on(table.externalSource,table.metadataRefreshedAt),index("media_metadata_status_idx").on(table.metadataStatus)]);
export const userMedia=sqliteTable("user_media",{id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),mediaId:text("media_id").notNull().references(()=>media.id,{onDelete:"cascade"}),status:text("status",{enum:MEDIA_STATUSES}).notNull().default("PLANNED"),score:integer("score"),progressCurrent:integer("progress_current").notNull().default(0),progressTotal:integer("progress_total"),notes:text("notes"),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull()},table=>[uniqueIndex("user_media_user_media_uq").on(table.userId,table.mediaId),index("user_media_user_idx").on(table.userId),index("user_media_status_idx").on(table.userId,table.status)]);
export const importBatches=sqliteTable("import_batches",{id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),kind:text("kind",{enum:["QUICK"]}).notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},table=>[index("import_batches_user_idx").on(table.userId),index("import_batches_created_idx").on(table.createdAt)]);
export const importRows=sqliteTable("import_rows",{id:text("id").primaryKey(),batchId:text("batch_id").notNull().references(()=>importBatches.id,{onDelete:"cascade"}),rawInput:text("raw_input").notNull(),userDataJson:text("user_data_json"),candidatesJson:text("candidates_json").notNull().default("[]"),selectedCandidateKey:text("selected_candidate_key"),state:text("state",{enum:["PENDING","CONFIRMED","SKIPPED","ERROR"]}).notNull().default("PENDING"),errorMessage:text("error_message"),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},table=>[index("import_rows_batch_idx").on(table.batchId)]);
export const serviceState=sqliteTable("service_state",{id:text("id").primaryKey(),lastBackupAt:integer("last_backup_at",{mode:"timestamp_ms"}),lastBackupKey:text("last_backup_key"),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull()});
