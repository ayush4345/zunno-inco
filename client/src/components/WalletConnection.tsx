"use client";

import { useEffect } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "@/config/networks";

interface WalletConnectionProps {
  onConnect?: (publicKey: string | null) => void;
}

export function WalletConnection({ onConnect }: WalletConnectionProps) {
  const { address, isConnected, chainId } = useAccount();
  const {
    connect,
    connectors,
    error: connectError,
    isPending: isConnecting,
  } = useConnect();
  const {
    switchChain,
    error: switchError,
    isPending: isSwitching,
  } = useSwitchChain();

  // Notify parent when address changes
  useEffect(() => {
    if (onConnect) {
      onConnect(address || null);
    }
  }, [address, onConnect]);

  if (isConnected && address && chainId === baseSepolia.id) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-green-500 font-medium">
          ✓ Browser wallet connected
        </div>
        <div className="text-xs text-gray-400">
          {address.substring(0, 6)}...{address.substring(address.length - 4)}
        </div>
      </div>
    );
  }

  const needsNetworkSwitch = isConnected && chainId !== baseSepolia.id;
  const browserWallet = connectors[0];
  const isPending = isConnecting || isSwitching;
  const error = connectError || switchError;

  const handleClick = () => {
    if (needsNetworkSwitch) {
      switchChain({ chainId: baseSepolia.id });
    } else if (browserWallet) {
      connect({ connector: browserWallet, chainId: baseSepolia.id });
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || (!needsNetworkSwitch && !browserWallet)}
        className="group relative overflow-hidden rounded-xl transition-all duration-300 ease-out disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-75 group-hover:opacity-100 transition-opacity duration-300 animate-gradient-shift" />
        <div className="relative flex items-center gap-3 px-6 py-3 rounded-[10px] bg-gray-900/95 backdrop-blur-sm transition-all duration-300 group-hover:bg-gray-900/80">
          <span className="text-white font-semibold text-sm tracking-wide">
            {isPending
              ? "Waiting for wallet..."
              : needsNetworkSwitch
                ? "Switch to Base Sepolia"
                : "Connect Browser Wallet"}
          </span>
        </div>
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-center text-xs text-red-400">
          {error.message}
        </p>
      )}
    </div>
  );
}
