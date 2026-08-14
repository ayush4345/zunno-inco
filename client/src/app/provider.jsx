"use client";

import RecoilProvider from "../userstate/RecoilProvider";
import { WalletProvider } from "../providers/WalletProvider";
import { SocketConnectionProvider } from "../context/SocketConnectionContext";

export function Providers({ children }) {
  return (
    <RecoilProvider>
      <WalletProvider>
        <SocketConnectionProvider>{children}</SocketConnectionProvider>
      </WalletProvider>
    </RecoilProvider>
  );
}
