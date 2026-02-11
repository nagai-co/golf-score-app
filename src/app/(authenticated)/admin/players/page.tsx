'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

type Player = {
  id: string;
  name: string;
  gender?: string;
  birth_year?: number;
  initial_handicap?: number;
  current_handicap?: number;
  total_points: number;
  participation_count: number;
  is_active: boolean;
};

export default function PlayersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [year, setYear] = useState(2026);

  // フォームの状態
  const [formName, setFormName] = useState('');
  const [formGender, setFormGender] = useState<'male' | 'female'>('male');
  const [formBirthYear, setFormBirthYear] = useState('');
  const [formInitialHandicap, setFormInitialHandicap] = useState('');
  const [error, setError] = useState('');

  const fetchPlayers = useCallback(async () => {
    const res = await fetch(`/api/admin/players?year=${year}`);
    if (res.ok) {
      setPlayers(await res.json());
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    fetchPlayers();
  }, [user, router, fetchPlayers]);

  const resetForm = () => {
    setFormName('');
    setFormGender('male');
    setFormBirthYear('');
    setFormInitialHandicap('');
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (editingId) {
      // 更新
      const body = {
        name: formName,
        gender: formGender,
        birth_year: formBirthYear ? parseInt(formBirthYear) : null,
        initial_handicap: formInitialHandicap ? parseFloat(formInitialHandicap) : null,
        current_handicap: formInitialHandicap ? parseFloat(formInitialHandicap) : null,
        year
      };

      const res = await fetch(`/api/admin/players/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '更新に失敗しました');
        return;
      }
    } else {
      // 新規登録
      if (!formInitialHandicap) {
        setError('初期ハンデは必須です');
        return;
      }

      const res = await fetch('/api/admin/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          gender: formGender,
          birth_year: formBirthYear ? parseInt(formBirthYear) : null,
          initial_handicap: parseFloat(formInitialHandicap),
          year
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '登録に失敗しました');
        return;
      }
    }

    resetForm();
    fetchPlayers();
  };

  const handleEdit = (player: Player) => {
    setFormName(player.name);
    setFormGender((player.gender || 'male') as 'male' | 'female');
    setFormBirthYear(player.birth_year?.toString() || '');
    setFormInitialHandicap(player.initial_handicap?.toString() || '');
    setEditingId(player.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name}を削除しますか？この操作は取り消せません。`)) return;

    const res = await fetch(`/api/admin/players/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPlayers();
    } else {
      alert('削除に失敗しました');
    }
  };

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">プレイヤー管理</h1>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            {[2026, 2027, 2028].map(y => (
              <option key={y} value={y}>{y}年度</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          新規プレイヤー登録
        </button>
      </div>

      {/* 登録・編集フォーム */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'プレイヤー編集' : '新規プレイヤー登録'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">名前*</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">性別</label>
                <select
                  value={formGender}
                  onChange={(e) => setFormGender(e.target.value as 'male' | 'female')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">生年（西暦）</label>
                <input
                  type="number"
                  value={formBirthYear}
                  onChange={(e) => setFormBirthYear(e.target.value)}
                  placeholder="1980"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{year}年度 初期ハンデ*</label>
                <input
                  type="number"
                  step="0.1"
                  value={formInitialHandicap}
                  onChange={(e) => setFormInitialHandicap(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {editingId ? '更新' : '登録'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* プレイヤー一覧 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">性別</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">生年</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">初期HC</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">現在HC</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">ポイント</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">参加数</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {players.map((player) => (
              <tr key={player.id}>
                <td className="px-6 py-4 whitespace-nowrap font-medium">{player.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {player.gender === 'female' ? '女性' : '男性'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {player.birth_year || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {player.initial_handicap?.toFixed(1) || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                  {player.current_handicap?.toFixed(1) || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-blue-600">
                  {player.total_points}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {player.participation_count}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <button
                    onClick={() => handleEdit(player)}
                    className="text-blue-600 hover:text-blue-800 mr-3"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(player.id, player.name)}
                    className="text-red-600 hover:text-red-800"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {players.length === 0 && (
        <p className="text-center text-gray-500 py-8">プレイヤーが登録されていません</p>
      )}
    </div>
  );
}
