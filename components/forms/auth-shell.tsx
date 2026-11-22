import type { ReactNode } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

export function AuthShell({ children, titleId }: { children: ReactNode; titleId: string }) {
  return <div className="fold-auth">
    <header className="fold-auth-branding">
      <Link href="/" className="fold-brand fold-auth-wordmark" aria-label="Fold home"><FileText aria-hidden="true" />Fold</Link>
      <svg className="fold-auth-illustration" viewBox="0 0 440 440" fill="none" aria-hidden="true" focusable="false">
        <g stroke="currentColor" strokeWidth="2.2">
          <g transform="rotate(5 280 192)">
            <rect x="154" y="35" width="246" height="300" rx="22" />
            <path d="M188 78h95" strokeWidth="12" strokeLinecap="round" opacity=".45" />
            <rect x="184" y="110" width="184" height="32" rx="6" />
            <rect x="184" y="201" width="184" height="32" rx="6" />
            <rect x="184" y="270" width="184" height="32" rx="6" />
          </g>
          <rect x="38" y="98" width="258" height="324" rx="20" fill="var(--fold-auth-paper)" />
          <path d="M74 140h98m-98 91h98m-98 102h98" strokeWidth="12" strokeLinecap="round" opacity=".45" />
          <rect x="68" y="162" width="197" height="32" rx="6" />
          <circle cx="77" cy="260" r="9" /><circle cx="77" cy="289" r="9" />
          <path d="M103 260h44m-44 29h44" strokeWidth="12" strokeLinecap="round" opacity=".45" />
          <rect x="68" y="354" width="197" height="32" rx="6" />
          <path d="m235 367 7 7 7-7" />
        </g>
      </svg>
    </header>
    <main className="fold-auth-main" aria-labelledby={titleId}>
      <div className="fold-auth-content">{children}</div>
    </main>
  </div>;
}
