import type { AccentId, ThemeId } from '../types/agency';

export interface ThemeTokens {
  isLight: boolean;
  bodyBg: string;
  shell: string;
  glow: string;
  dot: string;
  iconBtn: string;
  iconBtnActive: string;
  primaryBtn: string;
  secondaryBtn: string;
  surface: string;
  accentCard: string;
  tabWrap: string;
  tabActive: string;
  tabIdle: string;
  divider: string;
  fabHalo: string;
  fabCore: string;
  fabRing: string;
  overlay: string;
  input: string;
  userBubble: string;
  caliBubble: string;
  subtleBadge: string;
  dockBg: string;
}

export const TEXT_ACCENTS: Record<AccentId, { dark: string; light: string; label: string }> = {
  marigold: { dark: '#FFB732', light: '#C2610C', label: 'Marigold' },
  lavender: { dark: '#C4B5FD', light: '#6D28D9', label: 'Lavender' },
  champagne: { dark: '#E7D5B8', light: '#85643A', label: 'Champagne' },
  silverblue: { dark: '#A5B4FC', light: '#4338CA', label: 'Silver-Blue' }
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  monolith: {
    isLight: false,
    bodyBg: '#09090B',
    shell: 'bg-[#121215] text-[#F4F4F5]',
    glow: 'bg-[#6C4CD1]',
    dot: 'bg-[#8B5CF6]',
    iconBtn: 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]',
    iconBtnActive: 'bg-[#6C4CD1]/25 text-[#C4B5FD]',
    primaryBtn: 'bg-[#6C4CD1] hover:bg-[#5B3DC0] text-white',
    secondaryBtn: 'bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 border-white/[0.1]',
    surface: 'bg-[#18181D]/90 border-white/[0.08]',
    accentCard: 'bg-[#6C4CD1]/[0.12] border-[#8B5CF6]/35',
    tabWrap: 'bg-black/35',
    tabActive: 'bg-white/[0.12] text-white shadow-sm',
    tabIdle: 'text-zinc-400 hover:text-zinc-200',
    divider: 'divide-white/[0.07]',
    fabHalo: 'bg-[#6C4CD1]/35',
    fabCore: 'bg-[#6C4CD1] text-white border-violet-300/30',
    fabRing: 'text-[#C4B5FD]',
    overlay: 'bg-[#121215]/96 text-[#F4F4F5]',
    input: 'bg-white/[0.05] border-white/[0.12] text-zinc-100 placeholder-zinc-500 focus:border-[#8B5CF6]',
    userBubble: 'bg-[#6C4CD1] text-white border-transparent',
    caliBubble: 'bg-white/[0.05] text-zinc-100 border-white/[0.08]',
    subtleBadge: 'bg-white/[0.07] text-zinc-300 border-white/[0.1]',
    dockBg: 'bg-[#18181D]/92 border-white/[0.12] shadow-2xl shadow-black/60'
  },
  nocturne: {
    isLight: false,
    bodyBg: '#080709',
    shell: 'bg-[#0C0B0E] text-[#F5F2EB]',
    glow: 'bg-[#D4B88C]',
    dot: 'bg-[#E7D5B8]',
    iconBtn: 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.06]',
    iconBtnActive: 'bg-[#E7D5B8]/20 text-[#E7D5B8]',
    primaryBtn: 'bg-[#E7D5B8] hover:bg-[#DEC6A1] text-[#141210]',
    secondaryBtn: 'bg-white/[0.04] hover:bg-white/[0.08] text-stone-200 border-white/[0.1]',
    surface: 'bg-[#151318]/90 border-white/[0.08]',
    accentCard: 'bg-[#E7D5B8]/[0.09] border-[#E7D5B8]/30',
    tabWrap: 'bg-black/35',
    tabActive: 'bg-white/[0.11] text-stone-100 shadow-sm',
    tabIdle: 'text-stone-400 hover:text-stone-200',
    divider: 'divide-white/[0.07]',
    fabHalo: 'bg-[#E7D5B8]/30',
    fabCore: 'bg-[#E7D5B8] text-[#141210] border-white/25',
    fabRing: 'text-[#E7D5B8]',
    overlay: 'bg-[#0C0B0E]/96 text-[#F5F2EB]',
    input: 'bg-white/[0.05] border-white/[0.12] text-stone-100 placeholder-stone-500 focus:border-[#E7D5B8]',
    userBubble: 'bg-[#E7D5B8] text-[#141210] border-transparent',
    caliBubble: 'bg-white/[0.05] text-stone-100 border-white/[0.08]',
    subtleBadge: 'bg-white/[0.07] text-stone-300 border-white/[0.1]',
    dockBg: 'bg-[#16141A]/92 border-white/[0.12] shadow-2xl shadow-black/60'
  },
  alabaster: {
    isLight: true,
    bodyBg: '#ECEAE3',
    shell: 'bg-[#F7F5F0] text-[#18181B]',
    glow: 'bg-[#6C4CD1]',
    dot: 'bg-[#6C4CD1]',
    iconBtn: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/[0.06]',
    iconBtnActive: 'bg-[#6C4CD1]/15 text-[#5B3DC0]',
    primaryBtn: 'bg-[#6C4CD1] hover:bg-[#5B3DC0] text-white',
    secondaryBtn: 'bg-zinc-900/[0.05] hover:bg-zinc-900/[0.09] text-zinc-800 border-zinc-900/[0.12]',
    surface: 'bg-white/90 border-zinc-900/[0.09]',
    accentCard: 'bg-[#6C4CD1]/[0.08] border-[#6C4CD1]/30',
    tabWrap: 'bg-zinc-900/[0.06]',
    tabActive: 'bg-white text-zinc-900 shadow-sm',
    tabIdle: 'text-zinc-500 hover:text-zinc-800',
    divider: 'divide-zinc-900/[0.08]',
    fabHalo: 'bg-[#6C4CD1]/25',
    fabCore: 'bg-[#6C4CD1] text-white border-violet-400/30',
    fabRing: 'text-[#6C4CD1]',
    overlay: 'bg-[#F7F5F0]/97 text-[#18181B]',
    input: 'bg-white border-zinc-900/[0.14] text-zinc-900 placeholder-zinc-400 focus:border-[#6C4CD1]',
    userBubble: 'bg-[#6C4CD1] text-white border-transparent',
    caliBubble: 'bg-white text-zinc-800 border-zinc-900/[0.1]',
    subtleBadge: 'bg-zinc-900/[0.06] text-zinc-700 border-zinc-900/[0.1]',
    dockBg: 'bg-white/95 border-zinc-900/[0.12] shadow-xl shadow-zinc-900/10'
  }
};
