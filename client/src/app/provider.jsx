"use client";

import RecoilProvider from "../userstate/RecoilProvider";
import { MiniKitContextProvider } from "../providers/MiniKitProvider";
import { WalletProvider } from "../providers/WalletProvider";
import { SocketConnectionProvider } from "../context/SocketConnectionContext";

export function Providers({ children }) {
  return (
    <RecoilProvider>
      <WalletProvider>
        <SocketConnectionProvider>
          <MiniKitContextProvider>{children}</MiniKitContextProvider>
        </SocketConnectionProvider>
      </WalletProvider>
    </RecoilProvider>
  );
}
