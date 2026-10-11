create table if not exists public.brain_battle_teams (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now(),
    constraint brain_battle_teams_name_length
        check (char_length(trim(name)) between 1 and 40),
    constraint brain_battle_teams_name_unique unique (name)
);

create table if not exists public.brain_battle_scores (
    id uuid primary key default gen_random_uuid(),
    player_name text not null,
    team_id uuid not null references public.brain_battle_teams(id),
    score integer not null check (score >= 0),
    total_questions integer not null check (total_questions > 0),
    created_at timestamptz not null default now(),
    constraint brain_battle_player_name_length
        check (char_length(trim(player_name)) between 1 and 40),
    constraint brain_battle_score_limit
        check (score <= total_questions)
);

create index if not exists brain_battle_scores_individual_idx
    on public.brain_battle_scores (score desc, created_at asc);

create index if not exists brain_battle_scores_team_idx
    on public.brain_battle_scores (team_id, score desc);

alter table public.brain_battle_teams enable row level security;
alter table public.brain_battle_scores enable row level security;

revoke all on public.brain_battle_teams from anon, authenticated;
revoke all on public.brain_battle_scores from anon, authenticated;

-- Unique identifier for each quiz attempt; prevents duplicate score submissions.
alter table public.brain_battle_scores
    add column if not exists attempt_id uuid;

create unique index if not exists brain_battle_scores_attempt_id_unique
    on public.brain_battle_scores (attempt_id)
    where attempt_id is not null;

-- Seed the two supported teams.
insert into public.brain_battle_teams (name)
values ('Boys'), ('Girls')
on conflict (name) do nothing;
