'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { FooterNav } from '@/components/footer-nav';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // フッターナビゲーションを表示するパス
  const showFooterPaths = ['/events', '/annual', '/admin'];
  // スコア入力画面・組選択画面ではフッターを非表示
  const isScoreInputPage = /\/events\/[^/]+\/score/.test(pathname);
  const shouldShowFooter = showFooterPaths.some(path => pathname === path || pathname.startsWith(path + '/')) && !isScoreInputPage;

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={shouldShowFooter ? "min-h-screen pb-14" : "min-h-screen"}>
      {children}
      {shouldShowFooter && <FooterNav />}
    </div>
  );
}
