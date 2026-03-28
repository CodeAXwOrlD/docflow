import type { AppProps } from "next/app";
import { Toaster } from "react-hot-toast";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#111425",
            color: "#e8eaf6",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: "10px",
            fontSize: "0.875rem",
          },
          success: { iconTheme: { primary: "#22c55e", secondary: "#080a12" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "#080a12" } },
        }}
      />
    </>
  );
}
