// Small inline icon set (stroke icons, 24px grid). aria-hidden by default.
type P = { className?: string; title?: string };
const base = (path: React.ReactNode, { className = "w-5 h-5", title }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
    {title ? <title>{title}</title> : null}
    {path}
  </svg>
);

export const IconHome = (p: P) => base(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>, p);
export const IconBriefcase = (p: P) => base(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>, p);
export const IconSpark = (p: P) => base(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.3 6.3 2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" /></>, p);
export const IconBookmark = (p: P) => base(<path d="M6 3h12v18l-6-4-6 4z" />, p);
export const IconBookmarkFilled = ({ className = "w-5 h-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden><path d="M6 3h12v18l-6-4-6 4z" fill="currentColor" /></svg>
);
export const IconUser = (p: P) => base(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>, p);
export const IconSearch = (p: P) => base(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p);
export const IconFilter = (p: P) => base(<><path d="M4 6h16M7 12h10M10 18h4" /></>, p);
export const IconGlobe = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></>, p);
export const IconPin = (p: P) => base(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>, p);
export const IconRupee = (p: P) => base(<><path d="M7 4h11M7 9h11M7 4c6 0 6 9 0 9h-.5L15 21" /></>, p);
export const IconClock = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p);
export const IconShare = (p: P) => base(<><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></>, p);
export const IconFlag = (p: P) => base(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>, p);
export const IconEyeOff = (p: P) => base(<><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.7 2.4-3.4 3.8M6.4 7.6C4.6 8.9 3.2 10.7 2.5 12c1 1.5 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>, p);
export const IconExternal = (p: P) => base(<><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>, p);
export const IconWhatsapp = ({ className = "w-5 h-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z" /></svg>
);
export const IconLink = (p: P) => base(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, p);
export const IconClose = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p);
export const IconChevron = (p: P) => base(<path d="m9 6 6 6-6 6" />, p);
export const IconBell = (p: P) => base(<><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>, p);
export const IconShield = (p: P) => base(<><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="M12 8v5M12 16h.01" /></>, p);
export const IconLayers = (p: P) => base(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>, p);
