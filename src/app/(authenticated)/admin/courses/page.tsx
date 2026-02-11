'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

type CourseHole = {
  id: string;
  hole_number: number;
  par: number;
};

type Course = {
  id: string;
  name: string;
  created_at: string;
  course_holes: CourseHole[];
};

const DEFAULT_PARS = [4, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 4, 4, 3, 5];

export default function CoursesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formHoles, setFormHoles] = useState<number[]>([...DEFAULT_PARS]);
  const [error, setError] = useState('');

  const fetchCourses = useCallback(async () => {
    const res = await fetch('/api/admin/courses');
    if (res.ok) {
      setCourses(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    fetchCourses();
  }, [user, router, fetchCourses]);

  const resetForm = () => {
    setFormName('');
    setFormHoles([...DEFAULT_PARS]);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const setHolePar = (index: number, par: number) => {
    if (par < 3) par = 3;
    if (par > 5) par = 5;
    const newHoles = [...formHoles];
    newHoles[index] = par;
    setFormHoles(newHoles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const url = editingId
      ? `/api/admin/courses/${editingId}`
      : '/api/admin/courses';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName, holes: formHoles }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || '保存に失敗しました');
      return;
    }

    resetForm();
    fetchCourses();
  };

  const handleEdit = (course: Course) => {
    setFormName(course.name);
    setFormHoles(course.course_holes.map((h) => h.par));
    setEditingId(course.id);
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (course: Course) => {
    if (!confirm(`「${course.name}」を削除しますか？`)) return;

    const res = await fetch(`/api/admin/courses/${course.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      fetchCourses();
    }
  };

  const outTotal = (holes: number[]) => holes.slice(0, 9).reduce((a, b) => a + b, 0);
  const inTotal = (holes: number[]) => holes.slice(9, 18).reduce((a, b) => a + b, 0);

  if (user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#166534] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-lg font-bold">コース管理</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-white text-[#166534] px-3 py-1 rounded-md text-sm font-bold"
        >
          + 追加
        </button>
      </header>

      <main className="p-4">
        {/* 登録フォーム */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-4 space-y-4">
            <h2 className="font-bold text-gray-800">
              {editingId ? 'コース編集' : '新規コース登録'}
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">コース名</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="例: ○○カントリークラブ"
              />
            </div>

            {/* OUT (1-9) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-700">OUT (1-9H)</span>
                <span className="text-xs text-gray-500">合計: {outTotal(formHoles)}</span>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {formHoles.slice(0, 9).map((par, i) => (
                  <div key={i} className="text-center">
                    <div className="text-xs text-gray-500 mb-1">{i + 1}H</div>
                    <select
                      value={par}
                      onChange={(e) => setHolePar(i, Number(e.target.value))}
                      className="w-full text-center border border-gray-300 rounded py-1 text-sm"
                    >
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* IN (10-18) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-700">IN (10-18H)</span>
                <span className="text-xs text-gray-500">合計: {inTotal(formHoles)}</span>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {formHoles.slice(9, 18).map((par, i) => (
                  <div key={i + 9} className="text-center">
                    <div className="text-xs text-gray-500 mb-1">{i + 10}H</div>
                    <select
                      value={par}
                      onChange={(e) => setHolePar(i + 9, Number(e.target.value))}
                      className="w-full text-center border border-gray-300 rounded py-1 text-sm"
                    >
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-right text-sm text-gray-600">
              合計パー: {outTotal(formHoles) + inTotal(formHoles)}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-[#166534] text-white py-2 rounded-md text-sm font-bold"
              >
                {editingId ? '更新' : '登録'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-md text-sm"
              >
                キャンセル
              </button>
            </div>
          </form>
        )}

        {/* コース一覧 */}
        {loading ? (
          <p className="text-gray-500 text-sm">読み込み中...</p>
        ) : courses.length === 0 ? (
          <p className="text-gray-500 text-sm">コースが登録されていません</p>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => (
              <div key={course.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-gray-800">{course.name}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(course)}
                      className="text-blue-600 text-sm px-2 py-1"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(course)}
                      className="text-red-600 text-sm px-2 py-1"
                    >
                      削除
                    </button>
                  </div>
                </div>
                {course.course_holes.length > 0 && (
                  <div className="text-xs text-gray-500">
                    <div className="flex gap-1 flex-wrap">
                      <span className="font-bold">OUT:</span>
                      {course.course_holes.slice(0, 9).map((h) => (
                        <span key={h.hole_number}>{h.par}</span>
                      ))}
                      <span className="ml-1 font-bold">
                        = {course.course_holes.slice(0, 9).reduce((a, h) => a + h.par, 0)}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <span className="font-bold">IN:</span>
                      {course.course_holes.slice(9, 18).map((h) => (
                        <span key={h.hole_number}>{h.par}</span>
                      ))}
                      <span className="ml-1 font-bold">
                        = {course.course_holes.slice(9, 18).reduce((a, h) => a + h.par, 0)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
