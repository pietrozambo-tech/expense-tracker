# delete-account

Server-side account deletion for TracklyLab. Deletes the calling user's
`public.user_data` row **and** their `auth.users` identity. Runs with the
service-role key (auto-provided by the Edge Function runtime), which is why it
can't be done from the browser.

## Deploy

```bash
# one-time: link the local project to your Supabase project
supabase link --project-ref kxaqapcrbmuqulkltxum

# deploy the function (JWT verification stays ON — we read the caller's token)
supabase functions deploy delete-account
```

No secrets to set: `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are injected into the runtime automatically.

## Test

```bash
curl -i -X POST \
  https://kxaqapcrbmuqulkltxum.supabase.co/functions/v1/delete-account \
  -H "Authorization: Bearer <A_LOGGED_IN_USER_ACCESS_TOKEN>" \
  -H "apikey: <ANON_KEY>"
# expect: {"ok":true}
```

Afterwards the user is gone from Authentication → Users, their `user_data` row
is deleted, and signing in again with the same account creates a fresh, empty one.
