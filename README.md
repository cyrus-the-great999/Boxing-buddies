# Boxing Buddies

Find a sparring partner anywhere in the US. The app is a static site (`index.html`, `app.js`, `logic.mjs`) that talks to Supabase. There is no build step.

## Setup

1. Serve the folder. Any static server works:

   ```bash
   python3 -m http.server 4173
   ```

2. Open `http://127.0.0.1:4173/`.

The Supabase URL and publishable key live at the top of `app.js`. They are safe to ship in the browser. Do not put a secret or service-role key in this repo.

Production is the Vercel static deploy of `main` at https://boxingbuddies.vercel.app.

## Migrations

Apply these in order on any new database. They are already applied on project `evgdadutsupnxywtgfxh`.

| File | What it does |
| --- | --- |
| `supabase/migrations/20261101010000_gym_submissions.sql` | Boxers can add a gym. It stays private until you approve it or three other boxers confirm it. |
| `supabase/migrations/20261101013000_avatar_owner_read.sql` | A user can replace their own avatar file. |
| `supabase/migrations/20261101020000_launch_safety.sql` | 18+ confirmation, spam and rate limits, and `delete_own_account()`. |

From the Supabase SQL editor, paste each file once. They are safe to run again.

Approve a gym:

```sql
update public.gyms set status = 'approved' where id = <id>;
```

Mark a profile verified (boxers cannot do this themselves):

```sql
update public.profiles set verified = true where id = '<uuid>';
```

## Tests

```bash
node --test test/logic.test.mjs
```

## Launch checklist

- [ ] Site URL and redirect allow list include `https://boxingbuddies.vercel.app`.
- [ ] Magic-link email and Google sign-in both complete on the production URL.
- [ ] Replace the draft copy on `privacy.html` and `terms.html`.
- [ ] Confirm `20261101020000_launch_safety.sql` is applied (it is, on the current project).
- [ ] Decide who can set `profiles.verified`.
- [ ] Plan a gym import that already has coordinates. Do not bulk-geocode through Nominatim.
- [ ] Add `hero.jpg` only if you want a photo behind the sign-in art. The page no longer requests a missing file.
