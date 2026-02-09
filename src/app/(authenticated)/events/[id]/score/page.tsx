'use client';

import { useAuth } from '@/lib/auth-context';
import { useParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

type CourseHole = { hole_number: number; par: number };
type GroupMember = { user_id: string; users: { id: string; name: string } };
type EventGroup = { id: string; group_number: number; group_members: GroupMember[] };
type Participant = { user_id: string; users: { id: string; name: string } };
type ScoreData = {
  event_id: string;
  user_id: string;
  hole_number: number;
  strokes: number;
  putts: number;
};
type EventInfo = {
  id: string;
  name: string;
  event_date: string;
  status: string;
  courses: { course_holes: CourseHole[] } | null;
  event_participants: Participant[];
  event_groups: EventGroup[];
  scores: ScoreData[];
};

// ローカルストレージキー
const STORAGE_KEY = (eventId: string) => `golf-scores-${eventId}`;
const LAST_POS_KEY = (eventId: string) => `golf-lastpos-${eventId}`;
const PENDING_KEY = (eventId: string) => `golf-pending-${eventId}`;

export default function ScoreInputPage() {
  const { user } = useAuth();
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentHole, setCurrentHole] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [scores, setScores] = useState<Record<string, ScoreData>>({});
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const prevUserRef = useRef<string>('');
  const prevHoleRef = useRef<number>(1);
  const [showFooter, setShowFooter] = useState(false);
  const footerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // スコアのキー
  const scoreKey = (userId: string, holeNumber: number) => `${userId}-${holeNumber}`;

  // 同組メンバーの取得
  const getGroupMembers = useCallback((): Participant[] => {
    if (!event || !user) return [];

    // 自分が所属する組を探す
    const myGroup = event.event_groups.find((g) =>
      g.group_members.some((m) => m.user_id === user.id)
    );

    if (myGroup) {
      // 同組のメンバーのみ
      return myGroup.group_members.map((m) => ({
        user_id: m.user_id,
        users: m.users,
      }));
    }

    // 組が未設定の場合は全参加者を表示
    return event.event_participants;
  }, [event, user]);

  // イベントデータ取得
  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) return;
      const data: EventInfo = await res.json();
      setEvent(data);

      // サーバーのスコアをローカルに反映
      const scoreMap: Record<string, ScoreData> = {};
      data.scores.forEach((s) => {
        scoreMap[scoreKey(s.user_id, s.hole_number)] = s;
      });

      // ローカルの未送信スコアがあればマージ
      const pendingRaw = localStorage.getItem(PENDING_KEY(eventId));
      if (pendingRaw) {
        const pending: ScoreData[] = JSON.parse(pendingRaw);
        pending.forEach((s) => {
          scoreMap[scoreKey(s.user_id, s.hole_number)] = s;
        });
      }

      setScores(scoreMap);

      // ローカルにも保存
      localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(scoreMap));
    } catch {
      // オフライン時はローカルから復元
      const cached = localStorage.getItem(STORAGE_KEY(eventId));
      if (cached) {
        setScores(JSON.parse(cached));
      }
    }
    setLoading(false);
  }, [eventId]);

  // 初期化
  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // 最後の位置を復元
  useEffect(() => {
    if (!event || !user) return;

    const lastPos = localStorage.getItem(LAST_POS_KEY(eventId));
    if (lastPos) {
      const { hole, userId } = JSON.parse(lastPos);
      setCurrentHole(hole);
      setSelectedUserId(userId);
    } else {
      setSelectedUserId(user.id);
    }
  }, [event, user, eventId]);

  // 位置を記録
  useEffect(() => {
    if (selectedUserId && currentHole) {
      localStorage.setItem(
        LAST_POS_KEY(eventId),
        JSON.stringify({ hole: currentHole, userId: selectedUserId })
      );
    }
  }, [selectedUserId, currentHole, eventId]);

  // フッター表示制御（スクロール/タッチ時に表示、一定時間後に非表示）
  useEffect(() => {
    const showFooterTemporarily = () => {
      setShowFooter(true);
      if (footerTimerRef.current) clearTimeout(footerTimerRef.current);
      footerTimerRef.current = setTimeout(() => setShowFooter(false), 3000);
    };

    window.addEventListener('scroll', showFooterTemporarily, { passive: true });
    window.addEventListener('touchmove', showFooterTemporarily, { passive: true });

    return () => {
      window.removeEventListener('scroll', showFooterTemporarily);
      window.removeEventListener('touchmove', showFooterTemporarily);
      if (footerTimerRef.current) clearTimeout(footerTimerRef.current);
    };
  }, []);

  // オンライン状態監視
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingScores();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // 未送信スコアの同期
  const syncPendingScores = useCallback(async () => {
    const pendingRaw = localStorage.getItem(PENDING_KEY(eventId));
    if (!pendingRaw) return;

    const pending: ScoreData[] = JSON.parse(pendingRaw);
    if (pending.length === 0) return;

    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: pending }),
      });

      if (res.ok) {
        localStorage.removeItem(PENDING_KEY(eventId));
      }
    } catch {
      // 次回の接続時にリトライ
    }
  }, [eventId]);

  // スコア保存
  const saveScore = useCallback(
    async (userId: string, holeNumber: number) => {
      const key = scoreKey(userId, holeNumber);
      const score = scores[key];
      if (!score || (score.strokes === 0 && score.putts === 0)) return;

      const payload = {
        event_id: eventId,
        user_id: userId,
        hole_number: holeNumber,
        strokes: score.strokes,
        putts: score.putts,
        updated_by: user?.id,
      };

      if (!navigator.onLine) {
        // オフライン: ペンディングに追加
        const pendingRaw = localStorage.getItem(PENDING_KEY(eventId));
        const pending: ScoreData[] = pendingRaw ? JSON.parse(pendingRaw) : [];
        const idx = pending.findIndex(
          (p) => p.user_id === userId && p.hole_number === holeNumber
        );
        if (idx >= 0) {
          pending[idx] = payload;
        } else {
          pending.push(payload);
        }
        localStorage.setItem(PENDING_KEY(eventId), JSON.stringify(pending));
        return;
      }

      setSaving(true);
      try {
        await fetch('/api/scores', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // 失敗時はペンディングに追加
        const pendingRaw = localStorage.getItem(PENDING_KEY(eventId));
        const pending: ScoreData[] = pendingRaw ? JSON.parse(pendingRaw) : [];
        pending.push(payload);
        localStorage.setItem(PENDING_KEY(eventId), JSON.stringify(pending));
      }
      setSaving(false);
    },
    [scores, eventId, user?.id]
  );

  // メンバー切替時・ホール移動時に自動保存
  const handleMemberSwitch = useCallback(
    (newUserId: string) => {
      // 前のユーザーのスコアを保存
      if (prevUserRef.current) {
        saveScore(prevUserRef.current, currentHole);
      }
      prevUserRef.current = newUserId;
      setSelectedUserId(newUserId);
    },
    [saveScore, currentHole]
  );

  const handleHoleChange = useCallback(
    (newHole: number) => {
      if (newHole < 1 || newHole > 18) return;
      // 現在のユーザーのスコアを保存
      if (selectedUserId) {
        saveScore(selectedUserId, currentHole);
      }
      prevHoleRef.current = newHole;
      setCurrentHole(newHole);
    },
    [saveScore, selectedUserId, currentHole]
  );

  // スコア値の更新
  const updateScore = (field: 'strokes' | 'putts', delta: number) => {
    if (!selectedUserId) return;
    const key = scoreKey(selectedUserId, currentHole);
    const holePar = event?.courses?.course_holes?.find((h) => h.hole_number === currentHole)?.par || 4;
    const current = scores[key] || {
      event_id: eventId,
      user_id: selectedUserId,
      hole_number: currentHole,
      strokes: holePar,
      putts: 2,
    };

    let newVal = (current[field] || 0) + delta;
    if (field === 'strokes' && newVal < 1) newVal = 1;
    if (field === 'putts' && newVal < 0) newVal = 0;

    const updated = { ...current, [field]: newVal };
    const newScores = { ...scores, [key]: updated };
    setScores(newScores);
    localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(newScores));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">イベントが見つかりません</p>
      </div>
    );
  }

  const holes = event.courses?.course_holes?.sort((a, b) => a.hole_number - b.hole_number) || [];
  const currentPar = holes.find((h) => h.hole_number === currentHole)?.par || 4;
  const groupMembers = getGroupMembers();
  const currentScore = scores[scoreKey(selectedUserId, currentHole)] || {
    strokes: currentPar,
    putts: 2,
  };

  // パーとの差分表示
  const getDiffLabel = (strokes: number, par: number): string => {
    if (strokes === 0) return '';
    const diff = strokes - par;
    if (diff <= -2) return 'イーグル';
    if (diff === -1) return 'バーディ';
    if (diff === 0) return 'パー';
    if (diff === 1) return 'ボギー';
    if (diff === 2) return 'Wボギー';
    return `+${diff}`;
  };

  const diffLabel = getDiffLabel(currentScore.strokes, currentPar);
  const diff = currentScore.strokes > 0 ? currentScore.strokes - currentPar : 0;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50 select-none">
      {/* 1. メンバー選択（2行×2列） */}
      <div className="grid grid-cols-2 gap-[1px] bg-gray-200">
        {groupMembers.slice(0, 4).map((p) => (
          <button
            key={p.user_id}
            onClick={() => handleMemberSwitch(p.user_id)}
            className={`py-5 font-bold transition-colors ${
              selectedUserId === p.user_id
                ? 'bg-[#166534] text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
            style={{ fontSize: 'min(28px, 6.5vw)' }}
          >
            {p.users.name}
          </button>
        ))}
      </div>

      {/* 2. 打数エリア */}
      <div className="flex-1 flex flex-col justify-center items-center bg-green-50 px-4">
        <span className="text-sm font-bold text-gray-600 mb-2">打数</span>
        <div className="flex items-center justify-center gap-6 w-full">
          <button
            onClick={() => updateScore('strokes', -1)}
            className="w-[min(64px,16vw)] h-[min(64px,16vw)] rounded-full border-2 border-gray-300 bg-white flex items-center justify-center active:bg-gray-100"
          >
            <span className="text-[min(32px,8vw)] leading-none text-gray-500">
              −
            </span>
          </button>
          <span
            className="font-bold text-gray-900 min-w-[80px] text-center"
            style={{ fontSize: 'min(80px, 20vw)' }}
          >
            {currentScore.strokes}
          </span>
          <button
            onClick={() => updateScore('strokes', 1)}
            className="w-[min(72px,18vw)] h-[min(72px,18vw)] rounded-full bg-[#166534] flex items-center justify-center active:bg-[#14532d]"
          >
            <span className="text-[min(36px,9vw)] leading-none text-white font-bold">
              +
            </span>
          </button>
        </div>
        <span
          className={`text-sm font-bold mt-1 min-h-[20px] ${
            diff > 0 ? 'text-red-600' : diff < 0 ? 'text-blue-600' : 'text-green-700'
          }`}
        >
          {diffLabel ? (diff !== 0 ? `${diff > 0 ? '+' : ''}${diff} ${diffLabel}` : diffLabel) : ''}
        </span>
      </div>

      {/* 3. パットエリア */}
      <div className="flex-1 flex flex-col justify-center items-center bg-white px-4">
        <span className="text-sm font-bold text-gray-600 mb-2">パット</span>
        <div className="flex items-center justify-center gap-6 w-full">
          <button
            onClick={() => updateScore('putts', -1)}
            className="w-[min(64px,16vw)] h-[min(64px,16vw)] rounded-full border-2 border-gray-300 bg-white flex items-center justify-center active:bg-gray-100"
          >
            <span className="text-[min(32px,8vw)] leading-none text-gray-500">
              −
            </span>
          </button>
          <span
            className="font-bold text-gray-900 min-w-[80px] text-center"
            style={{ fontSize: 'min(80px, 20vw)' }}
          >
            {currentScore.putts}
          </span>
          <button
            onClick={() => updateScore('putts', 1)}
            className="w-[min(72px,18vw)] h-[min(72px,18vw)] rounded-full bg-gray-600 flex items-center justify-center active:bg-gray-700"
          >
            <span className="text-[min(36px,9vw)] leading-none text-white font-bold">
              +
            </span>
          </button>
        </div>
      </div>

      {/* 4. ホール番号ナビ */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
        <button
          onClick={() => handleHoleChange(currentHole - 1)}
          disabled={currentHole <= 1}
          className="w-[48px] h-[48px] rounded bg-[#166534] flex items-center justify-center disabled:opacity-30 active:bg-[#14532d]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
            <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="text-center">
          <span className="font-bold text-gray-900" style={{ fontSize: 'min(56px, 14vw)' }}>
            {currentHole}<span className="text-[0.4em]">H</span>
          </span>
          <span className="text-sm text-gray-500 block -mt-1">
            PAR {currentPar}
          </span>
        </div>

        <button
          onClick={() => handleHoleChange(currentHole + 1)}
          disabled={currentHole >= 18}
          className="w-[48px] h-[48px] rounded bg-[#166534] flex items-center justify-center disabled:opacity-30 active:bg-[#14532d]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
            <path fillRule="evenodd" d="M16.28 11.47a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 011.06-1.06l7.5 7.5z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* 5. フッターナビ（スクロール時のみ表示） */}
      <nav className={`bg-[#166534] flex justify-around items-center h-14 fixed bottom-0 left-0 right-0 transition-transform duration-300 ${showFooter ? 'translate-y-0' : 'translate-y-full'}`}>
        <Link href="/home" className="flex items-center justify-center w-full h-full text-white opacity-60">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </Link>
        <Link href="/events" className="flex items-center justify-center w-full h-full text-white opacity-100">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
        </Link>
        <Link href="/annual" className="flex items-center justify-center w-full h-full text-white opacity-60">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </Link>
      </nav>
    </div>
  );
}
