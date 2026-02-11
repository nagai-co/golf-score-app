'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type GroupMember = { player_id: string; players: { id: string; name: string } };
type EventGroup = { id: string; group_number: number; start_time: string; group_members: GroupMember[] };
type EventInfo = {
  id: string;
  name: string;
  event_groups: EventGroup[];
};

export default function SelectGroupPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvent(data);
    } catch {
      // エラー時は何もしない
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

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

  const groups = event.event_groups?.sort((a, b) => a.group_number - b.group_number) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#166534] text-white px-4 py-4 flex items-center gap-3">
        <Link href={`/events/${eventId}`} className="text-white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">組を選択</h1>
      </div>

      <div className="p-4 space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">組み合わせが設定されていません</p>
            <button
              onClick={() => router.push(`/events/${eventId}/score`)}
              className="px-6 py-3 bg-[#166534] text-white font-bold rounded-lg"
            >
              全員でスコア入力
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <button
              key={group.id}
              onClick={() => router.push(`/events/${eventId}/score?group=${group.id}`)}
              className="w-full bg-white rounded-lg shadow-sm p-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-lg text-gray-900">
                  第{group.group_number}組
                </span>
                {group.start_time && (
                  <span className="text-sm text-gray-500">
                    {group.start_time}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.group_members.map((m) => (
                  <span
                    key={m.player_id}
                    className="px-3 py-1 bg-green-50 text-green-800 rounded-full text-sm font-medium"
                  >
                    {m.players.name}
                  </span>
                ))}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
