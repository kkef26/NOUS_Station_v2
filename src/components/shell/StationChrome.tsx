'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Activity, MessageSquare, Users, Factory, Cpu, Radio, Settings } from 'lucide-react';
import { useStore } from '@/lib/store';

interface ChipDef {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  href: string;
  match: (pathname: string) => boolean;
}

const CHIPS: ChipDef[] = [
  { icon: Activity,      label: 'Pulse',     href: '/',          match: (p) => p === '/' },
  { icon: MessageSquare, label: 'Chat',       href: '/chat',      match: (p) => p.startsWith('/chat') },
  { icon: Users,         label: 'Boardroom',  href: '/boardroom', match: (p) => p.startsWith('/boardroom') },
  { icon: Factory,       label: 'Factory',    href: '/factory',   match: (p) => p.startsWith('/factory') },
  { icon: Cpu,           label: 'Fleet',      href: '/fleet',     match: (p) => p.startsWith('/fleet') },
  { icon: Radio,         label: 'Signals',    href: '/signals',   match: (p) => p.startsWith('/signals') },
];

const ACTIVE_BG = 'color-mix(in oklab, #0891B2 18%, transparent)';
const ACTIVE_COLOR = '#0891B2';
const INACTIVE_COLOR = 'var(--text-tertiary)';

// Auto-hide constants
const EDGE_ZONE_PX = 6;       // invisible hover strip width
const HOVER_DELAY_MS = 250;   // delay before rail appears
const HIDE_DELAY_MS = 400;    // delay before rail hides after mouse leaves
const RAIL_WIDTH = 56;
const SLIDE_DURATION = '200ms';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

export function StationChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { navRailMode, setNavRailMode } = useStore();

  // Auto-hide state
  const [railVisible, setRailVisible] = useState(navRailMode === 'always-show');
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Sync visibility when mode changes
  useEffect(() => {
    if (navRailMode === 'always-show') setRailVisible(true);
    if (navRailMode === 'always-hide') setRailVisible(false);
  }, [navRailMode]);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }, []);

  // Edge zone: show rail after hover delay
  const handleEdgeEnter = useCallback(() => {
    if (navRailMode !== 'auto-hide') return;
    clearTimers();
    showTimerRef.current = setTimeout(() => setRailVisible(true), HOVER_DELAY_MS);
  }, [navRailMode, clearTimers]);

  const handleEdgeLeave = useCallback(() => {
    if (navRailMode !== 'auto-hide') return;
    clearTimers();
  }, [navRailMode, clearTimers]);

  // Rail itself: keep visible while hovering, hide after leaving
  const handleRailEnter = useCallback(() => {
    if (navRailMode !== 'auto-hide') return;
    clearTimers();
    setRailVisible(true);
  }, [navRailMode, clearTimers]);

  const handleRailLeave = useCallback(() => {
    if (navRailMode !== 'auto-hide') return;
    clearTimers();
    hideTimerRef.current = setTimeout(() => setRailVisible(false), HIDE_DELAY_MS);
  }, [navRailMode, clearTimers]);

  // Right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenuPos) return;
    const close = () => setContextMenuPos(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenuPos]);

  // Bare passthrough on auth pages — no shell chrome
  if (pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/project') || pathname.startsWith('/boardroom')) {
    return <>{children}</>;
  }

  const isAutoHide = navRailMode === 'auto-hide';
  const isAlwaysHide = navRailMode === 'always-hide';
  const showRail = navRailMode === 'always-show' || (isAutoHide && railVisible);
  const showEdgeZone = (isAutoHide && !railVisible) || isAlwaysHide;

  return (
    <div
      data-station-chrome
      style={{
        display: 'flex',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Edge hover zone — invisible strip on left edge when rail is hidden */}
      {showEdgeZone && !isMobile && (
        <div
          onMouseEnter={handleEdgeEnter}
          onMouseLeave={handleEdgeLeave}
          onContextMenu={handleContextMenu}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: EDGE_ZONE_PX,
            height: '100%',
            zIndex: 200,
            cursor: 'default',
          }}
        />
      )}

      {/* Fixed left rail — slides in/out */}
      {!isMobile && (
        <nav
          ref={navRef}
          aria-label="Station navigation"
          onMouseEnter={handleRailEnter}
          onMouseLeave={handleRailLeave}
          onContextMenu={handleContextMenu}
          style={{
            width: RAIL_WIDTH,
            minWidth: RAIL_WIDTH,
            height: '100%',
            background: 'var(--bg-0)',
            borderRight: '1px solid color-mix(in oklab, var(--text-tertiary, #666) 12%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 8,
            paddingBottom: 8,
            zIndex: 150,
            flexShrink: 0,
            borderRadius: 0,
            // Auto-hide: use position fixed + transform for slide effect
            ...(navRailMode !== 'always-show' ? {
              position: 'fixed' as const,
              left: 0,
              top: 0,
              transform: showRail ? 'translateX(0)' : `translateX(-${RAIL_WIDTH + 1}px)`,
              transition: `transform ${SLIDE_DURATION} ease-out`,
              boxShadow: showRail ? '4px 0 12px rgba(0,0,0,0.3)' : 'none',
            } : {}),
          }}
        >
          {/* Room chips */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            {CHIPS.map(({ icon: Icon, label, href, match }) => {
              const isActive = match(pathname);
              return (
                <RailChip
                  key={label}
                  href={href}
                  title={label}
                  isActive={isActive}
                  icon={<Icon size={18} color="currentColor" />}
                />
              );
            })}
          </div>

          {/* Settings gear — pinned bottom */}
          <RailChip
            href="/settings"
            title="Settings"
            isActive={pathname.startsWith('/settings')}
            icon={<Settings size={18} color="currentColor" />}
          />
        </nav>
      )}

      {/* Main canvas */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        paddingBottom: isMobile ? 56 : 0,
      }}>
        {children}
      </div>

      {/* Bottom tab bar — mobile only */}
      {isMobile && (
        <nav
          aria-label="Station navigation"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 56,
            background: 'var(--bg-0)',
            borderTop: '1px solid color-mix(in oklab, var(--text-tertiary, #666) 12%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            zIndex: 100,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {CHIPS.map(({ icon: Icon, label, href, match }) => {
            const isActive = match(pathname);
            return (
              <Link
                key={label}
                href={href}
                title={label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '6px 0',
                  color: isActive ? '#0891B2' : 'var(--text-tertiary)',
                  textDecoration: 'none',
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'color 0.15s ease',
                }}
              >
                <Icon size={20} color="currentColor" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Right-click context menu */}
      {contextMenuPos && (
        <NavRailContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          currentMode={navRailMode}
          onSelect={(mode) => {
            setNavRailMode(mode);
            setContextMenuPos(null);
          }}
        />
      )}
    </div>
  );
}

// ─── CONTEXT MENU ──────────────────────────────────────

type NavRailMode = 'always-show' | 'auto-hide' | 'always-hide';

function NavRailContextMenu({
  x, y, currentMode, onSelect,
}: {
  x: number; y: number;
  currentMode: NavRailMode;
  onSelect: (mode: NavRailMode) => void;
}) {
  const options: { mode: NavRailMode; label: string }[] = [
    { mode: 'always-show', label: 'Always Show' },
    { mode: 'auto-hide', label: 'Auto-Hide' },
    { mode: 'always-hide', label: 'Always Hide' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        background: 'var(--bg-1, #1a1a1a)',
        border: '1px solid var(--border, #333)',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 160,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{
        padding: '6px 12px 4px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-3, #666)',
      }}>
        Navigation Rail
      </div>
      {options.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => onSelect(mode)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: currentMode === mode ? '#0891B2' : 'var(--text-2, #ccc)',
            fontSize: 13,
            textAlign: 'left',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2, #2a2a2a)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          <span style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: currentMode === mode ? '2px solid #0891B2' : '1px solid var(--text-3, #666)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {currentMode === mode && (
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#0891B2',
              }} />
            )}
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── RAIL CHIP ─────────────────────────────────────────

interface RailChipProps {
  href: string;
  title: string;
  isActive: boolean;
  icon: React.ReactNode;
}

function RailChip({ href, title, isActive, icon }: RailChipProps) {
  return (
    <Link
      href={href}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 4,
        background: isActive ? ACTIVE_BG : 'transparent',
        transition: 'background 0.15s ease, color 0.15s ease',
        textDecoration: 'none',
        color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.color = INACTIVE_COLOR;
        }
      }}
    >
      {icon}
    </Link>
  );
}
