-- La función del disparador no debe poder llamarse desde la API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
