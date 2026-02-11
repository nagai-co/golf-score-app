'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

type Event = {
  id: string;
  name: string;
  event_date: string;
  status: string;
};

export default function CsvPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const res = await fetch('/api/events?status=all');
    if (res.ok) {
      setEvents(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    fetchEvents();

    // デフォルト期間: 今年
    const year = new Date().getFullYear();
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  }, [user, router, fetchEvents]);

  const downloadEventCsv = async (eventId: string) => {
    setDownloading(eventId);
    try {
      const res = await fetch(`/api/admin/csv?event_id=${eventId}`);
      if (!res.ok) return;

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : 'scores.csv';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const downloadBulkCsv = async () => {
    if (!startDate || !endDate) return;
    setDownloading('bulk');
    try {
      const res = await fetch(`/api/admin/csv?start_date=${startDate}&end_date=${endDate}`);
      if (!res.ok) {
        alert('該当期間のイベントがありません');
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : 'all_scores.csv';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
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
        <h1 className="text-lg font-bold">CSV出力</h1>
      </header>

      <main className="p-4 space-y-6">
        {/* 期間一括出力 */}
        <section className="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 className="font-bold text-gray-800">期間一括出力</h2>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <span className="text-gray-500">〜</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <button
            onClick={downloadBulkCsv}
            disabled={downloading === 'bulk'}
            className="w-full bg-[#166534] text-white py-2 rounded-md text-sm font-bold disabled:opacity-50"
          >
            {downloading === 'bulk' ? 'ダウンロード中...' : '一括ダウンロード'}
          </button>
        </section>

        {/* イベント単位出力 */}
        <section>
          <h2 className="font-bold text-gray-800 mb-3">イベント単位出力</h2>
          {loading ? (
            <p className="text-gray-500 text-sm">読み込み中...</p>
          ) : events.length === 0 ? (
            <p className="text-gray-500 text-sm">イベントがありません</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-lg shadow p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800">{event.name}</p>
                    <p className="text-xs text-gray-500">{formatDate(event.event_date)}</p>
                  </div>
                  <button
                    onClick={() => downloadEventCsv(event.id)}
                    disabled={downloading === event.id}
                    className="bg-[#166534] text-white px-3 py-1 rounded-md text-sm font-bold disabled:opacity-50"
                  >
                    {downloading === event.id ? '...' : 'CSV'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
