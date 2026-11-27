CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE data_sources (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  license text NOT NULL CHECK (length(license) BETWEEN 1 AND 200),
  attribution text NOT NULL CHECK (length(attribution) BETWEEN 1 AND 500),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cities (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(id) <= 120 AND id <> 'near'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  region text NOT NULL CHECK (length(region) BETWEEN 1 AND 120),
  country_code text NOT NULL CHECK (country_code = 'RU'),
  center geography(Point,4326) NOT NULL,
  bounds double precision[] NOT NULL CHECK (array_length(bounds,1) = 4 AND bounds[1] >= -180 AND bounds[3] <= 180 AND bounds[2] >= -90 AND bounds[4] <= 90 AND bounds[1] < bounds[3] AND bounds[2] < bounds[4]),
  timezone text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cities_center_gist ON cities USING gist(center);

CREATE TABLE categories (
  id text PRIMARY KEY CHECK (id IN ('cafe','shopping','pharmacy','medicine','beauty','auto','sport','hotel','entertainment','bank','education','government','services','fuel')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  icon text NOT NULL,
  marker text NOT NULL,
  sort_order smallint NOT NULL UNIQUE CHECK (sort_order BETWEEN 0 AND 13)
);

CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 120 AND slug <> 'near'),
  city_id text NOT NULL REFERENCES cities(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  address text NOT NULL CHECK (length(address) BETWEEN 1 AND 500),
  position geography(Point,4326) NOT NULL,
  description text CHECK (length(description) <= 5000),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{5,30}$'),
  website text CHECK (website IS NULL OR website ~ '^https?://'),
  opening_hours text CHECK (length(opening_hours) <= 2000),
  hours_verified_at timestamptz,
  accessibility text NOT NULL DEFAULT 'unknown' CHECK (accessibility IN ('yes','limited','no','unknown')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hours_verified_at IS NULL OR opening_hours IS NOT NULL)
);
CREATE INDEX places_position_gist ON places USING gist(position) WHERE active;
CREATE INDEX places_city_id_idx ON places(city_id,id) WHERE active;
CREATE TABLE place_categories (
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES categories(id),
  PRIMARY KEY(place_id,category_id)
);
CREATE INDEX place_categories_category_idx ON place_categories(category_id,place_id);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES data_sources(id),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_code text CHECK (length(error_code) <= 100),
  CHECK ((status = 'running') = (finished_at IS NULL)),
  UNIQUE(id,source_id)
);
CREATE INDEX import_jobs_source_started_idx ON import_jobs(source_id,started_at DESC);
CREATE TABLE source_records (
  source_id text NOT NULL REFERENCES data_sources(id),
  source_record_id text NOT NULL CHECK (length(source_record_id) BETWEEN 1 AND 200),
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  license text NOT NULL CHECK (length(license) BETWEEN 1 AND 200),
  attribution text NOT NULL CHECK (length(attribution) BETWEEN 1 AND 500),
  source_updated_at timestamptz,
  imported_at timestamptz NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  import_job_id uuid NOT NULL,
  PRIMARY KEY(source_id,source_record_id),
  FOREIGN KEY(import_job_id,source_id) REFERENCES import_jobs(id,source_id)
);
CREATE INDEX source_records_place_idx ON source_records(place_id);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES places(id),
  reason text NOT NULL CHECK (reason IN ('incorrect_address','closed','incorrect_hours','duplicate','other')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 2000),
  consent_recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_received_idx ON reports(status,received_at);
CREATE INDEX reports_place_idx ON reports(place_id);

CREATE TABLE platform_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 100),
  avatar_url text CHECK (avatar_url IS NULL OR avatar_url ~ '^https?://'),
  published_at timestamptz,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 200),
  consent_recorded_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','withdrawn')),
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX platform_reviews_public_idx ON platform_reviews(published_at DESC,id) WHERE status = 'published';
