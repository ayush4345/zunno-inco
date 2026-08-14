'use client';

import React from 'react';
import Link from 'next/link';
import { MyGames } from './MyGames';

const ProfilePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl bg-white/10 backdrop-blur-md rounded-xl shadow-lg p-8 text-white">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">User Profile</h1>
          <Link href="/play" className="bg-[#ff9000] hover:bg-[#ff7000] text-white font-bold py-2 px-4 rounded-full transition-colors">
            Back to Game
          </Link>
        </div>

        <div className="space-y-6">
          <MyGames />
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
