import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// イベント一覧取得
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const year = req.nextUrl.searchParams.get('year');
  const finalized = req.nextUrl.searchParams.get('finalized');

  let query = supabase
    .from('events')
    .select(`
      id, name, event_date, status, score_edit_deadline, event_type, is_finalized,
      courses ( id, name ),
      event_participants ( id, player_id, players ( id, name ) )
    `)
    .order('event_date', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (year) {
    query = query.gte('event_date', `${year}-01-01`).lt('event_date', `${parseInt(year) + 1}-01-01`);
  }

  if (finalized === 'true') {
    query = query.eq('is_finalized', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
