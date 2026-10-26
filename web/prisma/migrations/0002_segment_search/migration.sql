-- Full-text search over segments. 'simple' config: mixed Hindi/English, so no stemming.
-- Not modelled in schema.prisma; queried via $queryRaw in lib/search.ts.
ALTER TABLE "Segment"
  ADD COLUMN "search" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("editedText", "text"))) STORED;

CREATE INDEX "Segment_search_idx" ON "Segment" USING GIN ("search");
