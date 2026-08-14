'use client';

import ProfilePage from '@/components/profile/ProfilePage';

export default function Profile() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white">
      <div className="container mx-auto py-6 px-4 pb-24">
        <ProfilePage />
      </div>
    </main>
  );
}
