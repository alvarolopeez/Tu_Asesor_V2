// Env vars mínimas para que los módulos con createClient no rompan en tests.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
// scheduling.ts lee ADVISOR_WHATSAPP_PHONE como constante de módulo; debe estar
// configurado antes de que el módulo se cargue por primera vez.
process.env.ADVISOR_WHATSAPP_PHONE = '34697223944';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'fake-phone-number-id';
process.env.WHATSAPP_ACCESS_TOKEN = 'fake-access-token';
