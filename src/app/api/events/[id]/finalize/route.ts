import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// イベント結果の型定義
type EventResultItem = {
  player_id: string;
  gross_score: number;
  net_score: number;
  handicap_before: number;
  rank?: number;
  points?: number;
  handicap_after?: number;
  under_par_strokes?: number;
};

// ポイントテーブル
const POINTS_TABLE: Record<string, Record<number, number>> = {
  regular: { 1: 16, 2: 8, 3: 4, 4: 2, 5: 1 },
  major: { 1: 21, 2: 12, 3: 7, 4: 4, 5: 2 },
  final: { 1: 26, 2: 16, 3: 10, 4: 6, 5: 3 }
};

// ハンデキャップ計算（基本ルール）
function calculateHandicapUpdate(
  currentHandicap: number,
  rank: number,
  netScore: number,
  coursePar: number = 72
): { nextHandicap: number; underParStrokes: number } {
  let underParStrokes = 0;
  let adjustedHandicap = currentHandicap;

  // アンダーカット適用
  if (netScore < coursePar) {
    underParStrokes = coursePar - netScore;
    adjustedHandicap = currentHandicap - underParStrokes;
  }

  // 順位による係数適用（1位:0.7、2位:0.8、3位:0.9）
  const coefficients: Record<number, number> = { 1: 0.7, 2: 0.8, 3: 0.9 };
  const coefficient = coefficients[rank] || 1.0;

  let nextHandicap = Math.floor(adjustedHandicap * coefficient * 10) / 10;

  // ハンデが以下の場合の加算（1位:+3、2位:+2、3位:+1）
  if (rank <= 3 && adjustedHandicap < nextHandicap) {
    const additions: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
    nextHandicap = adjustedHandicap + additions[rank];
  }

  return { nextHandicap, underParStrokes };
}

// イベント確定API
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = id;
    await req.json(); // リクエストボディを消費

    // イベント情報取得
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*, courses(id, name)')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
    }

    if (event.is_finalized) {
      return NextResponse.json({ error: 'このイベントは既に確定済みです' }, { status: 400 });
    }

    // コースのパー合計を取得
    const { data: holes, error: holesError } = await supabase
      .from('course_holes')
      .select('par')
      .eq('course_id', event.course_id);

    if (holesError || !holes) {
      return NextResponse.json({ error: 'コース情報の取得に失敗しました' }, { status: 500 });
    }

    const coursePar = holes.reduce((sum, hole) => sum + hole.par, 0);

    // イベント参加者のスコアを取得
    const { data: participants, error: participantsError } = await supabase
      .from('event_participants')
      .select('player_id')
      .eq('event_id', eventId);

    if (participantsError || !participants) {
      return NextResponse.json({ error: '参加者情報の取得に失敗しました' }, { status: 500 });
    }

    // 各参加者のスコアとハンデを計算
    const results: EventResultItem[] = [];
    for (const participant of participants) {
      const playerId = participant.player_id;

      // スコア取得
      const { data: scores, error: scoresError } = await supabase
        .from('scores')
        .select('strokes')
        .eq('event_id', eventId)
        .eq('player_id', playerId);

      if (scoresError) continue;

      const grossScore = scores?.reduce((sum, s) => sum + (s.strokes || 0), 0) || 0;

      // 現在のハンデ取得
      const { data: seasonStats, error: statsError } = await supabase
        .from('player_season_stats')
        .select('current_handicap')
        .eq('player_id', playerId)
        .eq('year', event.year)
        .single();

      if (statsError || !seasonStats) continue;

      const currentHandicap = seasonStats.current_handicap;
      const netScore = grossScore - currentHandicap;

      results.push({
        player_id: playerId,
        gross_score: grossScore,
        net_score: netScore,
        handicap_before: currentHandicap
      });
    }

    // ネットスコアで順位付け
    results.sort((a, b) => {
      if (a.net_score !== b.net_score) return a.net_score - b.net_score;
      // ネットスコアが同じ場合、ハンデが低い方を上位
      return a.handicap_before - b.handicap_before;
    });

    // 順位とポイントを割り当て
    results.forEach((result, index) => {
      const rank = index + 1;
      result.rank = rank;
      result.points = POINTS_TABLE[event.event_type || 'regular'][rank] || 0;

      // ハンデ更新計算（上位3位のみ）
      if (rank <= 3) {
        const { nextHandicap, underParStrokes } = calculateHandicapUpdate(
          result.handicap_before,
          rank,
          result.net_score,
          coursePar
        );
        result.handicap_after = nextHandicap;
        result.under_par_strokes = underParStrokes;
      } else {
        result.handicap_after = result.handicap_before;
        result.under_par_strokes = 0;
      }
    });

    // event_resultsテーブルに結果を保存
    const { error: resultsError } = await supabase
      .from('event_results')
      .insert(
        results.map(r => ({
          event_id: eventId,
          player_id: r.player_id,
          gross_score: r.gross_score,
          net_score: r.net_score,
          rank: r.rank,
          points: r.points,
          handicap_before: r.handicap_before,
          handicap_after: r.handicap_after,
          under_par_strokes: r.under_par_strokes
        }))
      );

    if (resultsError) {
      return NextResponse.json({ error: resultsError.message }, { status: 500 });
    }

    // player_season_statsを更新（ハンデとポイント）
    for (const result of results) {
      // 現在の値を取得
      const { data: currentStats } = await supabase
        .from('player_season_stats')
        .select('total_points, participation_count')
        .eq('player_id', result.player_id)
        .eq('year', event.year)
        .single();

      // 更新
      await supabase
        .from('player_season_stats')
        .update({
          current_handicap: result.handicap_after,
          total_points: (currentStats?.total_points || 0) + result.points,
          participation_count: (currentStats?.participation_count || 0) + 1
        })
        .eq('player_id', result.player_id)
        .eq('year', event.year);

      // ハンデ履歴に記録
      if (result.handicap_before !== result.handicap_after) {
        await supabase.from('handicap_history').insert({
          player_id: result.player_id,
          event_id: eventId,
          year: event.year,
          handicap_before: result.handicap_before,
          handicap_after: result.handicap_after,
          adjustment_reason: '期中更新'
        });
      }
    }

    // イベントを確定状態に更新
    await supabase
      .from('events')
      .update({
        is_finalized: true,
        finalized_at: new Date().toISOString(),
        finalized_by: null,
        status: 'completed'
      })
      .eq('id', eventId);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error finalizing event:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// イベント結果取得
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = id;

    const { data: results, error } = await supabase
      .from('event_results')
      .select(`
        *,
        players(name, gender)
      `)
      .eq('event_id', eventId)
      .order('rank');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(results || []);
  } catch (error) {
    console.error('Error fetching event results:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
