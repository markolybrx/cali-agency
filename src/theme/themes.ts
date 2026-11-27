import type { AccentId, ThemeId } from '../types/agency';

export interface ThemeTokens {
  id: ThemeId;
  isLight: boolean;
  bodyBg: string;
  shell: string;
  overlay: string;
  surface: string;
  accentCard: string;
  glow: string;
  dot: string;
  primaryBtn: string;
  secondaryBtn: string;
  input: string;
  subtleBadge: string;
  tabWrap: string;
  tabActive: string;
  tabIdle: string;
  dockBg: string;
  iconBtn: string;
  iconBtnActive: string;
  fabCore: string;
  fabHalo: string;
  userBubble: string;
  caliBubble: string;
}

export const TEXT_ACCENTS: Record<AccentId, { label: string; dark: string; light: string }> = {
  marigold: { label: 'Marigold', dark: '#FFB732', light: '#B45309' },
  lavender: { label: 'Lavender', dark: '#C4B5FD', light: '#6D28D9' },
  champagne: { label: 'Champagne', dark: '#E7D5B8', light: '#85643A' },
  silverblue: { label: 'Silver Blue', dark: '#A5B4FC', light: '#4338CA' }
};

const MONOLITH_DARK: ThemeTokens = {
  id: 'monolith',
  isLight: false,
  bodyBg: '#09090B',
  shell: 'bg-[#121215] text-[#F4F4F5]',
  overlay: 'bg-[#121215]/96 text-[#F4F4F5]',
  surface: 'bg-[#18181D] border-white/[0.09]',
  accentCard: 'bg-[#8B5CF6]/[0.12] border-[#8B5CF6]/40',
  glow: 'bg-[#8B5CF6]',
  dot: 'bg-[#8B5CF6]',
  primaryBtn: 'bg-[#8B5CF6] hover:bg-[#7C3AED] text-white border-transparent',
  secondaryBtn: 'bg-white/[0.06] hover:bg-white/[0.11] text-[#F4F4F5] border-white/[0.11]',
  input: 'bg-[#18181D] border-white/[0.12] text-[#F4F4F5] placeholder:text-zinc-500 focus:border-[#8B5CF6]',
  subtleBadge: 'bg-white/[0.06] border-white/[0.11] text-zinc-200',
  tabWrap: 'bg-white/[0.06]',
  tabActive: 'bg-[#8B5CF6] text-white shadow',
  tabIdle: 'text-zinc-400 hover:text-zinc-200',
  dockBg: 'bg-[#16161C]/94 border-white/[0.1] shadow-2xl',
  iconBtn: 'text-zinc-400 hover:text-white hover:bg-white/[0.06]',
  iconBtnActive: 'bg-[#8B5CF6]/20 text-[#C4B5FD]',
  fabCore: 'bg-[#8B5CF6] text-white border-violet-300/30',
  fabHalo: 'bg-[#8B5CF6]/35',
  userBubble: 'bg-[#8B5CF6] text-white border-transparent',
  caliBubble: 'bg-[#18181D] text-[#F4F4F5] border-white/[0.1]'
};

const MONOLITH_LIGHT: ThemeTokens = {
  id: 'light',
  isLight: true,
  bodyBg: '#F4F4F5',
  shell: 'bg-[#FAFAFA] text-[#18181B]',
  overlay: 'bg-[#FAFAFA]/97 text-[#18181B]',
  surface: 'bg-white border-zinc-900/[0.09] shadow-xs',
  accentCard: 'bg-[#6D28D9]/[0.07] border-[#6D28D9]/30',
  glow: 'bg-[#8B5CF6]',
  dot: 'bg-[#6D28D9]',
  primaryBtn: 'bg-[#6D28D9] hover:bg-[#5B21B6] text-white border-transparent',
  secondaryBtn: 'bg-zinc-900/[0.04] hover:bg-zinc-900/[0.08] text-[#18181B] border-zinc-900/[0.1]',
  input: 'bg-white border-zinc-900/[0.14] text-[#18181B] placeholder:text-zinc-400 focus:border-[#6D28D9]',
  subtleBadge: 'bg-zinc-900/[0.04] border-zinc-900/[0.1] text-zinc-700',
  tabWrap: 'bg-zinc-900/[0.06]',
  tabActive: 'bg-[#6D28D9] text-white shadow',
  tabIdle: 'text-zinc-600 hover:text-zinc-900',
  dockBg: 'bg-white/94 border-zinc-900/[0.1] shadow-2xl',
  iconBtn: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/[0.05]',
  iconBtnActive: 'bg-[#6D28D9]/12 text-[#6D28D9]',
  fabCore: 'bg-[#6D28D9] text-white border-violet-400/30',
  fabHalo: 'bg-[#6D28D9]/25',
  userBubble: 'bg-[#6D28D9] text-white border-transparent',
  caliBubble: 'bg-white text-[#18181B] border-zinc-900/[0.1]'
};

export function normalizeThemeId(raw: string | null | undefined): ThemeId {
  if (raw === 'light' || raw === 'alabaster') return 'light';
  return 'monolith';
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  monolith: MONOLITH_DARK,
  light: MONOLITH_LIGHT
};
