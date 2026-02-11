'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

type Member = { id: string; name: string };
type Course = { id: string; name: string };
type GroupDraft = {
  group_number: number;
  start_time: string;
  members: string[];
};

export default function NewEventPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [courseId, setCourseId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    const [membersRes, coursesRes] = await Promise.all([
      fetch(`/api/admin/players?year=${new Date().getFullYear()}`),
      fetch('/api/admin/courses'),
    ]);
    if (membersRes.ok) setMembers(await membersRes.json());
    if (coursesRes.ok) setCourses(await coursesRes.json());
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    fetchData();
  }, [user, router, fetchData]);

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        group_number: prev.length + 1,
        start_time: '08:00',
        members: [],
      },
    ]);
  };

  const removeGroup = (index: number) => {
    setGroups((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((g, i) => ({ ...g, group_number: i + 1 }));
    });
  };

  const updateGroupTime = (index: number, time: string) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, start_time: time } : g)));
  };

  const toggleGroupMember = (groupIndex: number, userId: string) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g;
        const members = g.members.includes(userId)
          ? g.members.filter((m) => m !== userId)
          : [...g.members, userId];
        return { ...g, members };
      })
    );
  };

  // 組に割り当て済みのメンバーID一覧
  const assignedMembers = groups.flatMap((g) => g.members);

  // 参加者のうち未割り当てのメンバー
  const unassignedParticipants = selectedParticipants.filter(
    (id) => !assignedMembers.includes(id)
  );

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!eventName || !eventDate || !courseId) {
      setError('イベント名、日付、コースは必須です');
      return;
    }

    if (selectedParticipants.length === 0) {
      setError('参加者を1人以上選択してください');
      return;
    }

    setSubmitting(true);

    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: eventName,
        event_date: eventDate,
        course_id: courseId,
        participants: selectedParticipants,
        groups: groups.filter((g) => g.members.length > 0),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || '作成に失敗しました');
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    router.push(`/events/${data.id}`);
  };

  if (user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#166534] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/admin')} className="text-white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">イベント作成</h1>
      </header>

      <main className="p-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* 基本情報 */}
          <section className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="font-bold text-gray-800">基本情報</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">イベント名</label>
              <input
                type="text"
                required
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="例: 第12回月例会"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">コース</label>
              <select
                required
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">選択してください</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </section>

          {/* 参加者選択 */}
          <section className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="font-bold text-gray-800">
              参加者 ({selectedParticipants.length}人)
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleParticipant(m.id)}
                  className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    selectedParticipants.includes(m.id)
                      ? 'bg-[#166534] text-white border-[#166534]'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </section>

          {/* 組み合わせ */}
          <section className="bg-white rounded-lg shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">組み合わせ</h2>
              <button
                type="button"
                onClick={addGroup}
                className="bg-[#166534] text-white px-3 py-1 rounded-md text-sm font-bold"
              >
                + 組追加
              </button>
            </div>

            {groups.length === 0 && (
              <p className="text-gray-500 text-sm">組を追加してメンバーを割り当ててください</p>
            )}

            {groups.map((group, gi) => (
              <div key={gi} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-800">
                    {group.group_number}組
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={group.start_time}
                      onChange={(e) => updateGroupTime(gi, e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(gi)}
                      className="text-red-500 text-sm"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {/* 組メンバー */}
                <div className="flex flex-wrap gap-1">
                  {group.members.map((userId) => (
                    <span
                      key={userId}
                      onClick={() => toggleGroupMember(gi, userId)}
                      className="bg-[#166534] text-white px-2 py-1 rounded text-xs cursor-pointer"
                    >
                      {getMemberName(userId)} ×
                    </span>
                  ))}
                </div>

                {/* 未割り当て参加者 */}
                {unassignedParticipants.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {unassignedParticipants.map((userId) => (
                      <button
                        key={userId}
                        type="button"
                        onClick={() => toggleGroupMember(gi, userId)}
                        className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs border border-gray-300"
                      >
                        + {getMemberName(userId)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#166534] text-white py-3 rounded-lg font-bold text-base disabled:opacity-50"
          >
            {submitting ? '作成中...' : 'イベントを作成'}
          </button>
        </form>
      </main>
    </div>
  );
}
