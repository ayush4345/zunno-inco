"use client";

import dynamic from "next/dynamic";
import RecoilProvider from "../userstate/RecoilProvider";
import { MiniKitContextProvider } from "../providers/MiniKitProvider";
import { WalletProvider } from "../providers/WalletProvider";
import { SocketConnectionProvider } from "../context/SocketConnectionContext";

// Dynamically import ZKProvider to avoid SSR issues with WASM
const ZKProvider = dynamic(
  () => import("../lib/zk/ZKContext").then((mod) => mod.ZKProvider),
  { ssr: false }
);

export function Providers({ children }) {
  return (
    <RecoilProvider>
      <WalletProvider>
        <SocketConnectionProvider>
          <ZKProvider autoLoad={true}>
            <MiniKitContextProvider>{children}</MiniKitContextProvider>
          </ZKProvider>
        </SocketConnectionProvider>
      </WalletProvider>
    </RecoilProvider>
  );
}
