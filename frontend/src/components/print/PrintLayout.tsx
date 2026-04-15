import { useEffect, type ReactNode } from "react";
import "@fontsource-variable/dm-sans/index.css";
import "@fontsource/instrument-serif/400.css";
import "./print.css";

interface PrintLayoutProps {
  ready: boolean;
  children: ReactNode;
}

declare global {
  interface Window {
    __PRINT_READY__?: boolean;
  }
}

export function PrintLayout({ ready, children }: PrintLayoutProps) {
  useEffect(() => {
    document.body.classList.add("print-mode");
    return () => {
      document.body.classList.remove("print-mode");
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const markReady = async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      } catch {
        // ignore font-readiness errors
      }
      // Double rAF ensures React commits + layout + paints before signaling.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) {
            window.__PRINT_READY__ = true;
          }
        });
      });
    };
    markReady();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return <div className="print-root">{children}</div>;
}

export function PrintPage({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`print-page ${className ?? ""}`}>{children}</section>;
}

interface PrintCoverProps {
  title: string;
  startupName: string;
  stage?: string | null;
  generatedAt?: Date;
  subtitle?: string;
}

export function PrintCover({ title, startupName, stage, generatedAt, subtitle }: PrintCoverProps) {
  const date = (generatedAt ?? new Date()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <section className="print-page print-cover">
      <div>
        <div
          style={{
            fontSize: "9pt",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "#163F67",
            marginBottom: "12mm",
          }}
        >
          Inside Line
        </div>
        <h1 style={{ marginBottom: "4mm" }}>{title}</h1>
        {subtitle ? (
          <div style={{ fontSize: "11pt", color: "#475569", maxWidth: "160mm" }}>{subtitle}</div>
        ) : null}
      </div>
      <div style={{ borderTop: "1px solid #163F67", paddingTop: "6mm" }}>
        <div style={{ fontSize: "20pt", fontFamily: "Instrument Serif, serif" }}>{startupName}</div>
        <div style={{ display: "flex", gap: "10mm", marginTop: "3mm", fontSize: "9pt", color: "#475569" }}>
          {stage ? <span>Stage: {stage}</span> : null}
          <span>Generated {date}</span>
        </div>
      </div>
    </section>
  );
}
