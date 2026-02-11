import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (!pin) {
      return NextResponse.json(
        { error: 'PINを入力してください' },
        { status: 400 }
      );
    }

    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['admin_pin', 'general_pin']);

    if (error || !settings) {
      return NextResponse.json(
        { error: '認証設定の取得に失敗しました' },
        { status: 500 }
      );
    }

    const adminPin = settings.find(s => s.key === 'admin_pin')?.value;
    const generalPin = settings.find(s => s.key === 'general_pin')?.value;

    if (pin === adminPin) {
      return NextResponse.json({ role: 'admin' });
    }

    if (pin === generalPin) {
      return NextResponse.json({ role: 'player' });
    }

    return NextResponse.json(
      { error: 'PINが正しくありません' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
