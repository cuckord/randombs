import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = ""https:/fclkjwqdcihjvvwhgvlm.supabase.co";
const SUPABASE_KEY = "sb_publishable_NsDjDaDKZb_ix3HRvebNoQ_3Gewb75-";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

