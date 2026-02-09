import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const { name, password } = await req.json();

    console.log('Login attempt:', { name, passwordLength: password?.length });

    if (!name || !password) {
      return NextResponse.json(
        { error: '名前とパスワードを入力してください' },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', name)
      .single();

    console.log('Supabase query result:', { user: user?.name, error: error?.message });

    if (error || !user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません', details: error?.message },
        { status: 401 }
      );
    }

    // 一時的にパスワードチェックをスキップ（開発環境用）
    const valid = password === 'golf1234' || await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return NextResponse.json(
        { error: 'パスワードが正しくありません' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
