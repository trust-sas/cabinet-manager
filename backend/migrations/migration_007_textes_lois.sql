-- ============================================================================
-- CABINET MANAGER — migration_007_textes_lois.sql
-- Crée la table `textes_lois` pour le RAG juridique (Indexation des PDF de la loi)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS textes_lois (
    id              BIGSERIAL PRIMARY KEY,
    titre_loi       VARCHAR(255) NOT NULL,
    nom_fichier     VARCHAR(255) NOT NULL,
    section_titre   VARCHAR(255) NULL,
    contenu         TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index pour recherche full-text ultra rapide (PostgreSQL tsvector)
CREATE INDEX IF NOT EXISTS idx_textes_lois_fulltext 
    ON textes_lois USING gin (to_tsvector('french', titre_loi || ' ' || contenu));

-- Index Trigram pour la recherche approximative et les mots-clés (unaccent + ilike)
CREATE INDEX IF NOT EXISTS idx_textes_lois_trgm 
    ON textes_lois USING gin (unaccent_immutable(titre_loi || ' ' || contenu) gin_trgm_ops);

COMMENT ON TABLE textes_lois IS 'Corpus des textes de lois, décrets, arrêtés et codes camerounais/OHADA pour le moteur RAG de l''Assistant IA.';

COMMIT;
