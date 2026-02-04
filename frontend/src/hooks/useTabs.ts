import type React from "react";
import { useState, useRef, useEffect } from "react";

export interface TabConfig {
  id: string;
  label: React.ReactNode;
  content: () => React.ReactNode;
}

export function useTabs(tabs: TabConfig[], defaultActiveId?: string) {
  const [activeId, setActiveId] = useState(defaultActiveId || tabs[0]?.id);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverStyle, setHoverStyle] = useState({});
  const [activeStyle, setActiveStyle] = useState({ left: "0px", width: "0px" });
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const activeTab = tabs.find((tab) => tab.id === activeId);

  useEffect(() => {
    if (tabRefs.current.length !== tabs.length) {
      tabRefs.current = new Array(tabs.length).fill(null);
    }

    const updateIndicators = () => {
      const activeEl = tabRefs.current[activeIndex];
      if (activeEl) {
        const { offsetLeft, offsetWidth } = activeEl;
        setActiveStyle({ left: `${offsetLeft}px`, width: `${offsetWidth}px` });
      }
      if (hoveredIndex !== null) {
        const hoveredEl = tabRefs.current[hoveredIndex];
        if (hoveredEl) {
          const { offsetLeft, offsetWidth } = hoveredEl;
          setHoverStyle({ left: `${offsetLeft}px`, width: `${offsetWidth}px` });
        }
      }
    };

    const raf = requestAnimationFrame(updateIndicators);
    return () => cancelAnimationFrame(raf);
  }, [tabs.length, activeIndex, hoveredIndex]);

  useEffect(() => {
    const onResize = () => {
      const activeEl = tabRefs.current[activeIndex];
      if (activeEl) {
        const { offsetLeft, offsetWidth } = activeEl;
        setActiveStyle({ left: `${offsetLeft}px`, width: `${offsetWidth}px` });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex]);

  return {
    activeId,
    activeIndex,
    activeTab,
    hoveredIndex,
    hoverStyle,
    activeStyle,
    tabRefs,
    setActiveId,
    setHoveredIndex,
  };
}

