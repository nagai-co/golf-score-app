import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type RouteParams = { params: Promise<{ id: string }> };

// イベント詳細取得
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: event, error } = await supabase
    .from('events')
    .select(`
      id, name, event_date, status, score_edit_deadline, event_type, is_finalized, year,
      courses ( id, name,
        course_holes ( hole_number, par )
      ),
      event_participants ( id, player_id,
        players ( id, name )
      ),
      event_groups ( id, group_number, start_time,
        group_members ( id, player_id,
          players ( id, name )
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // スコア取得
  const { data: scores } = await supabase
    .from('scores')
    .select('*')
    .eq('event_id', id);

  // course_holes をソート
  if (event.courses && 'course_holes' in event.courses) {
    (event.courses as { course_holes: { hole_number: number }[] }).course_holes.sort(
      (a: { hole_number: number }, b: { hole_number: number }) => a.hole_number - b.hole_number
    );
  }

  // event_groups をソート
  if (event.event_groups) {
    event.event_groups.sort(
      (a: { group_number: number }, b: { group_number: number }) => a.group_number - b.group_number
    );
  }

  return NextResponse.json({ ...event, scores: scores || [] });
}

// イベント更新（参加者・組み合わせ含む）
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { name, event_date, course_id, status, participants, groups } = await req.json();

    // 基本情報の更新
    const updates: Record<string, string> = {};
    if (name) updates.name = name;
    if (event_date) updates.event_date = event_date;
    if (course_id) updates.course_id = course_id;
    if (status) updates.status = status;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // 参加者の更新（指定された場合）
    if (participants) {
      // 既存の参加者を削除して再登録
      await supabase.from('event_participants').delete().eq('event_id', id);

      if (participants.length > 0) {
        const participantRecords = participants.map((playerId: string) => ({
          event_id: id,
          player_id: playerId,
        }));
        const { error: partError } = await supabase
          .from('event_participants')
          .insert(participantRecords);
        if (partError) {
          return NextResponse.json({ error: partError.message }, { status: 500 });
        }
      }
    }

    // 組み合わせの更新（指定された場合）
    if (groups) {
      // 既存の組を取得して削除
      const { data: existingGroups } = await supabase
        .from('event_groups')
        .select('id')
        .eq('event_id', id);

      if (existingGroups && existingGroups.length > 0) {
        const groupIds = existingGroups.map((g: { id: string }) => g.id);
        await supabase.from('group_members').delete().in('group_id', groupIds);
        await supabase.from('event_groups').delete().eq('event_id', id);
      }

      // 新しい組を登録
      for (const group of groups) {
        const { data: groupData, error: groupError } = await supabase
          .from('event_groups')
          .insert({
            event_id: id,
            group_number: group.group_number,
            start_time: group.start_time,
          })
          .select('id')
          .single();

        if (groupError) {
          return NextResponse.json({ error: groupError.message }, { status: 500 });
        }

        if (group.members && group.members.length > 0) {
          const memberRecords = group.members.map((playerId: string) => ({
            group_id: groupData.id,
            player_id: playerId,
          }));
          const { error: memberError } = await supabase
            .from('group_members')
            .insert(memberRecords);
          if (memberError) {
            return NextResponse.json({ error: memberError.message }, { status: 500 });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// イベント削除
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
