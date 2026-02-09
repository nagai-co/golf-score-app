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
  const [showAttest, setShowAttest] = useState(false);
  const [attestType, setAttestType] = useState<'front' | 'full' | null>(null);

  const prevUserRef = useRef<string>('');
  const prevHoleRef = useRef<number>(1);

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

  // 現在のホールの全メンバーにスコアがない場合、デフォルト値で初期化
  useEffect(() => {
    if (!currentHole || !event || !user) return;

    const members = getGroupMembers();
    if (members.length === 0) return;

    const holePar = event.courses?.course_holes?.find((h) => h.hole_number === currentHole)?.par || 4;
    let hasUpdate = false;
    const newScores = { ...scores };

    members.forEach((member) => {
      const key = scoreKey(member.user_id, currentHole);
      if (!scores[key]) {
        newScores[key] = {
          event_id: eventId,
          user_id: member.user_id,
          hole_number: currentHole,
          strokes: holePar,
          putts: 2,
        };
        hasUpdate = true;
      }
    });

    if (hasUpdate) {
      setScores(newScores);
      localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(newScores));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHole, event, user, scores, eventId]);

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
      // 現在のユーザーのスコアを保存
      if (selectedUserId) {
        saveScore(selectedUserId, currentHole);
      }

      // 9H終了後（10Hに進む前）にアテスト画面を表示
      if (currentHole === 9 && newHole === 10) {
        setAttestType('front');
        setShowAttest(true);
        return; // アテスト確認後に10Hに進む
      }

      // 18H終了後にアテスト画面を表示
      if (currentHole === 18 && newHole === 19) {
        setAttestType('full');
        setShowAttest(true);
        return; // アテスト確認後に完了
      }

      // 範囲チェック
      if (newHole < 1 || newHole > 18) return;

      prevHoleRef.current = newHole;
      setCurrentHole(newHole);
    },
    [saveScore, selectedUserId, currentHole]
  );

  // アテスト確認OK
  const handleAttestConfirm = () => {
    setShowAttest(false);
    if (attestType === 'front') {
      // 9H終了後 → 10Hに進む
      setCurrentHole(10);
    } else if (attestType === 'full') {
      // 18H終了 → イベント一覧に戻る
      window.location.href = '/events';
    }
    setAttestType(null);
  };

  // アテスト修正
  const handleAttestEdit = (holeNumber: number, userId?: string) => {
    setShowAttest(false);
    if (userId) {
      setSelectedUserId(userId);
    }
    setCurrentHole(holeNumber);
    setAttestType(null);
  };

  // スコア集計（指定範囲のストローク・パット合計）
  const calculateTotal = (userId: string, startHole: number, endHole: number) => {
    let totalStrokes = 0;
    let totalPutts = 0;
    for (let h = startHole; h <= endHole; h++) {
      const key = scoreKey(userId, h);
      const score = scores[key];
      if (score) {
        totalStrokes += score.strokes || 0;
        totalPutts += score.putts || 0;
      }
    }
    return { strokes: totalStrokes, putts: totalPutts };
  };

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

  // アテストモーダルの表示内容
  const renderAttestModal = () => {
    if (!showAttest || !attestType) return null;

    const isFront = attestType === 'front';
    const displayHoles = isFront ? Array.from({ length: 9 }, (_, i) => i + 1) : Array.from({ length: 18 }, (_, i) => i + 1);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-auto">
          <div className="p-4 border-b border-gray-200 sticky top-0 bg-white">
            <h2 className="text-lg font-bold text-gray-900">
              {isFront ? '前半9ホール アテスト' : '18ホール アテスト'}
            </h2>
          </div>

          <div className="overflow-x-auto">
            {/* スコアテーブル */}
            <table className="w-full border-collapse">
              {/* ヘッダー行: ホール | メンバー名（横並び） */}
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-center font-bold text-gray-900 sticky left-0 bg-gray-100 z-10">
                    ホール
                  </th>
                  {groupMembers.map((member) => (
                    <th key={member.user_id} className="border border-gray-300 px-3 py-2 text-center font-bold text-gray-900 min-w-[100px]">
                      {member.users.name}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ボディ: 各ホールを縦に並べる */}
              <tbody>
                {displayHoles.map((h) => {
                  const holePar = holes.find((hole) => hole.hole_number === h)?.par || 4;

                  return (
                    <tr key={h} className="hover:bg-gray-50">
                      {/* ホール番号セル（固定列） */}
                      <td className="border border-gray-300 px-3 py-2 text-center font-bold text-gray-900 bg-gray-50 sticky left-0 z-10">
                        <button
                          onClick={() => handleAttestEdit(h)}
                          className="text-green-700 hover:text-green-900 hover:underline"
                        >
                          {h}H
                        </button>
                        <div className="text-xs text-gray-600 font-normal">
                          PAR {holePar}
                        </div>
                      </td>

                      {/* 各メンバーのスコアセル */}
                      {groupMembers.map((member) => {
                        const score = scores[scoreKey(member.user_id, h)];
                        const strokeVal = score?.strokes || 0;
                        const puttVal = score?.putts || 0;
                        const diffVal = strokeVal - holePar;
                        let bgColor = 'bg-white';
                        let textColor = 'text-gray-900';

                        if (strokeVal > 0) {
                          if (diffVal <= -2) {
                            bgColor = 'bg-blue-50';
                            textColor = 'text-blue-900';
                          } else if (diffVal === -1) {
                            bgColor = 'bg-blue-50';
                            textColor = 'text-blue-800';
                          } else if (diffVal === 0) {
                            bgColor = 'bg-white';
                            textColor = 'text-gray-900';
                          } else if (diffVal === 1) {
                            bgColor = 'bg-orange-50';
                            textColor = 'text-orange-900';
                          } else if (diffVal >= 2) {
                            bgColor = 'bg-red-50';
                            textColor = 'text-red-900';
                          }
                        }

                        return (
                          <td
                            key={member.user_id}
                            onClick={() => handleAttestEdit(h, member.user_id)}
                            className={`border border-gray-300 px-3 py-2 text-center cursor-pointer ${bgColor} hover:ring-2 hover:ring-inset hover:ring-green-600`}
                          >
                            <div className={`text-2xl font-bold ${textColor}`}>
                              {strokeVal > 0 ? `${strokeVal} (${puttVal})` : '-'}
                            </div>
                            {strokeVal > 0 && diffVal !== 0 && (
                              <div className={`text-xs font-semibold ${textColor} mt-1`}>
                                ({diffVal > 0 ? '+' : ''}{diffVal})
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* 合計スコア行 */}
                <tr className="bg-green-50 font-bold">
                  <td className="border-2 border-green-700 px-3 py-3 text-center text-green-900 sticky left-0 bg-green-50 z-10">
                    合計
                  </td>
                  {groupMembers.map((member) => {
                    const outTotal = calculateTotal(member.user_id, 1, 9);
                    const inTotal = calculateTotal(member.user_id, 10, 18);
                    const fullTotal = {
                      strokes: outTotal.strokes + inTotal.strokes,
                      putts: outTotal.putts + inTotal.putts
                    };

                    return (
                      <td key={member.user_id} className="border-2 border-green-700 px-3 py-3 text-center">
                        {!isFront && (
                          <div className="flex justify-center gap-4 mb-2 text-sm">
                            <div>
                              <span className="text-gray-600">OUT:</span>{' '}
                              <span className="text-gray-900">{outTotal.strokes || '-'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">IN:</span>{' '}
                              <span className="text-gray-900">{inTotal.strokes || '-'}</span>
                            </div>
                          </div>
                        )}
                        <div className="text-2xl font-bold text-green-900">
                          {isFront ? (outTotal.strokes || '-') : (fullTotal.strokes || '-')}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          P: {isFront ? (outTotal.putts || '-') : (fullTotal.putts || '-')}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-200 flex gap-2 sticky bottom-0 bg-white">
            <button
              onClick={handleAttestConfirm}
              className="flex-1 py-3 px-4 bg-[#166534] text-white font-bold rounded hover:bg-[#14532d] active:bg-[#14532d]"
            >
              {isFront ? '確認OK（後半へ）' : '確認OK（完了）'}
            </button>
          </div>
        </div>
      </div>
    );
  };

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
          className="w-[48px] h-[48px] rounded bg-[#166534] flex items-center justify-center active:bg-[#14532d]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
            <path fillRule="evenodd" d="M16.28 11.47a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 011.06-1.06l7.5 7.5z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* アテストモーダル */}
      {renderAttestModal()}
    </div>
  );
}
