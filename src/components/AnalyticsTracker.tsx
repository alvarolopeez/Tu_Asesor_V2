"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // We don't want to track admin page views in the visitor analytics
    if (pathname?.startsWith("/admin")) return;

    const trackPageView = async () => {
      try {
        let sessionId = localStorage.getItem("analytics_session_id");
        if (!sessionId) {
          sessionId = typeof crypto.randomUUID === "function" 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          localStorage.setItem("analytics_session_id", sessionId);
        }

        await fetch("/api/analytics/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: sessionId,
            page_path: pathname || "/",
            referrer: document.referrer || null,
            user_agent: navigator.userAgent || null,
            full_url: window.location.href,
          }),
        });
      } catch (err) {
        console.error("Failed to track page view:", err);
      }
    };

    trackPageView();
  }, [pathname]);

  return null;
}
