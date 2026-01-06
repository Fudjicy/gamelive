CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE NOT NULL,
  username text,
  first_name text,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  age int NOT NULL,
  height_cm int NOT NULL,
  weight_kg int NOT NULL,
  hair_style text NOT NULL,
  hair_color text NOT NULL,
  outfit_top text NOT NULL,
  outfit_bottom text NOT NULL,
  outfit_shoes text NOT NULL,
  level int NOT NULL DEFAULT 1,
  xp int NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  xp_reward int NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'active',
  due_at timestamp,
  repeat_type text NOT NULL DEFAULT 'none',
  repeat_interval int NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS quest_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done bool NOT NULL DEFAULT false,
  order_index int NOT NULL DEFAULT 0
);
