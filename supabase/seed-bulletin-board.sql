-- Seed the Team → Bulletin Board with what the company is focused on right now.
--
-- Board items are tasks with no assignee and a status of 'todo', which is what the
-- Team tab reads. Safe to re-run: an item whose title is already on the board is
-- skipped, so this never creates duplicates.
--
-- Run it in Supabase → SQL Editor. To swap an item out later, edit or delete it
-- from the dashboard rather than re-running this file.

INSERT INTO tasks (title, status, assignee, priority, created_at, updated_at)
SELECT v.title, 'todo', NULL, 'none', NOW() + (v.ord * INTERVAL '1 second'), NOW()
FROM (VALUES
  (1, 'Eric is speaking at Morehouse College'),
  (2, 'Eric is speaking at the Encore event'),
  (3, 'Use examples for all of our actions moving forward')
) AS v(ord, title)
WHERE NOT EXISTS (
  SELECT 1 FROM tasks t WHERE t.title = v.title AND t.assignee IS NULL
);
