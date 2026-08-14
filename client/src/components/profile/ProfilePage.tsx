'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { MyGames } from './MyGames';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletIdentity({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex items-center gap-4">
      <img
        src={`/api/avatar?seed=${address}`}
        alt=""
        className="w-16 h-16 rounded-2xl bg-white/5 shrink-0"
      />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white">Your Profile</h1>
        <button
          onClick={copyAddress}
          className="mt-1 flex items-center gap-1.5 font-mono text-sm text-white/60 hover:text-white/90 transition-colors"
          title={address}
        >
          <span className="truncate">{shortAddress(address)}</span>
          {copied ? (
            <span className="text-xs text-emerald-400 shrink-0">Copied</span>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 opacity-70">
              <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

const ProfilePage: React.FC = () => {
  const { address, isConnected } = useAccount();

  return (
    <div className="min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/play"
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to game
          </Link>
        </div>

        {isConnected && address ? (
          <>
            <div className="mb-12">
              <WalletIdentity address={address} />
            </div>
            <MyGames />
          </>
        ) : (
          <div className="flex flex-col items-center text-center py-20 gap-2">
            <h1 className="text-2xl font-bold text-white">No wallet connected</h1>
            <p className="text-white/60 max-w-xs">
              Connect your wallet from the game lobby to see your profile and game history.
            </p>
            <Link
              href="/play"
              className="mt-4 bg-[#ff9000] hover:bg-[#ff7000] text-white font-semibold py-2.5 px-6 rounded-full transition-colors"
            >
              Go to lobby
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
