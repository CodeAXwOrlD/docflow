import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import { Toaster } from "react-hot-toast";
import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isFirstPaintRef = useRef(true);

  useEffect(() => {
    isFirstPaintRef.current = false;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handleStart = (url: string) => {
      if (url === router.asPath || prefersReducedMotion) return;
      setIsTransitioning(true);
    };

    const handleComplete = () => {
      setIsTransitioning(false);
    };

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleComplete);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleComplete);
    };
  }, [router]);

  return (
    <>
      <Head>
        <title>DocFlow | Enterprise Async Document Workflow</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.svg" />
        <meta name="theme-color" content="#0d9488" />
        <meta
          name="description"
          content="Enterprise document processing engine with asynchronous Celery pipeline, neural OCR schema extraction, and interactive review."
        />
      </Head>

      <div
        className={`min-h-full transition-opacity duration-200 ease-out ${
          isTransitioning && !isFirstPaintRef.current ? "opacity-75" : "opacity-100"
        }`}
      >
        <Component {...pageProps} />
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0a0f24",
            color: "#f1f5f9",
            border: "1px solid rgba(20, 184, 166, 0.25)",
            borderRadius: "10px",
            fontSize: "0.875rem",
          },
          success: { iconTheme: { primary: "#10b981", secondary: "#050814" } },
          error: { iconTheme: { primary: "#f43f5e", secondary: "#050814" } },
        }}
      />
    </>
  );
}
