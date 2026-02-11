'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);

    // 次の入力欄にフォーカス
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // 4桁揃ったら自動送信
    if (value && index === 3) {
      const fullPin = newPin.join('');
      if (fullPin.length === 4) {
        handleSubmit(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (pinCode?: string) => {
    const code = pinCode || pin.join('');
    if (code.length !== 4) {
      setError('4桁のPINを入力してください');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const success = await login(code);
      if (success) {
        router.push('/events');
      } else {
        setError('PINが正しくありません');
        setPin(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError(`接続エラー: ${err}`);
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            ゴルフスコア管理
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            月例会スコア管理システム
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 text-center mb-4">
              PINコードを入力
            </label>
            <div className="flex justify-center gap-3">
              {pin.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isLoading}
                  className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
                  autoFocus={index === 0}
                />
              ))}
            </div>
          </div>

          {isLoading && (
            <p className="text-center text-sm text-gray-500">認証中...</p>
          )}
        </div>
      </div>
    </div>
  );
}
