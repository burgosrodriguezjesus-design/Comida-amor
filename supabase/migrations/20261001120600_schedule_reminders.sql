-- Revisión de recordatorios cada minuto: llama a la función «send-reminders» con el secreto
-- guardado en private.settings (cron_secret). Sustituye <PROJECT_REF> por el de tu proyecto.
select cron.schedule(
  'comida-amor-recordatorios',
  '* * * * *',
  $$select net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from private.settings where key = 'cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
  )$$
);

-- Configuración privada (no se guarda en el repositorio). Ejemplo:
-- insert into private.settings (key, value) values
--   ('vapid_public_key', '...'), ('vapid_private_key', '...'),
--   ('vapid_subject', 'https://tu-app.vercel.app'), ('cron_secret', '<aleatorio>'), ('allow_registration', 'true');
