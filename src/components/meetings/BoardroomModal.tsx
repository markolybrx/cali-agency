import React, { useEffect, useState } from 'react';
import type { AgencyReport, ProjectState } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import type { MeetingState } from './MeetingBlastOverlay';

interface BoardroomLine {
  id: string;
  speaker: string;
  roleColor: string;
  text: string;
}

interface BoardroomModalProps {
  meeting: MeetingState;
  project: ProjectState | null;
  pendingSuggestionsCount: number;
  onAdjourn: (minutesReport: AgencyReport) => void;
  t: ThemeTokens;
}

export const BoardroomModal: React.FC<BoardroomModalProps> = ({
  meeting,
  project,
  pendingSuggestionsCount,
  onAdjourn,
  t
}) => {
  const [lines, setLines] = useState<BoardroomLine[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!meeting.active || !meeting.showBoardroom) return;
    const pName = project?.project_name || 'Cali Studio';
    const phaseId = project?.current_phase_id || 1;
    const fileCount = project ? Object.keys(project.files).length : 0;

    setLines([
      {
        id: 'b1',
        speaker: 'Cali (COO)',
        roleColor: 'text-violet-400',
        text:
          meeting.kind === 'emergency' && meeting.caller === 'cali'
            ? `Boss Mark, I triggered an Emergency Pause on ${pName} (Phase ${phaseId}). Reason: ${meeting.reason} Let's align before resuming production.`
            : `Production is cleanly paused on ${pName} (Phase ${phaseId}, ${fileCount} files synced). All 4 Department Directors are seated in the Glass Boardroom.`
      },
      {
        id: 'b2',
        speaker: 'Elena — Director of Product',
        roleColor: 'text-blue-400',
        text: `Scope and Phase ${phaseId} acceptance criteria are locked. Any new directives you give here will be converted into atomic tickets by Kai (Delivery Manager).`
      },
      {
        id: 'b3',
        speaker: 'Sora — Creative Director',
        roleColor: 'text-pink-400',
        text: 'Design Studio confirms Original Monolith Dark/Light tokens, Editorial reading hierarchy, zero native popups, and zero emojis across all generated views.'
      },
      {
        id: 'b4',
        speaker: 'Marcus — CTO / Head of Engineering',
        roleColor: 'text-emerald-400',
        text: `IndexedDB persistence and live Android folder sync are active. We also have ${pendingSuggestionsCount} escalated specialist suggestion(s) on the board.`
      },
      {
        id: 'b5',
        speaker: 'Nadia — Director of Quality & Release',
        roleColor: 'text-amber-400',
        text: 'Static Pre-Check Gate and 1-on-1 Coaching Pods are armed. Once you confirm direction, QA and Debugger will verify every file before Phase Gate sign-off.'
      }
    ]);
  }, [meeting.active, meeting.showBoardroom, meeting.reason, meeting.kind, meeting.caller, project?.id]);

  if (!meeting.active || !meeting.showBoardroom) return null;

  const handleSpeak = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt) return;
    setInput('');
    setLines((prev) => [
      ...prev,
      { id: `ceo_${Date.now()}`, speaker: 'Mark (Founder & CEO)', roleColor: 'text-accent', text: txt },
      {
        id: `coo_${Date.now() + 1}`,
        speaker: 'Cali (COO)',
        roleColor: 'text-violet-400',
        text: 'Directive logged, Boss. Marcus (CTO) and Elena (Dir. Product) have aligned the squads. Tap Adjourn & Resume whenever you are ready to unfreeze the floor.'
      }
    ]);
  };

  const handleAdjournClick = () => {
    const pName = project?.project_name || 'Cali Studio';
    const isEm = meeting.kind === 'emergency';
    const transcriptMd = lines.map((l) => `- **${l.speaker}:** ${l.text}`).join('\n');
    const report: AgencyReport = {
      id: `rep_board_${Date.now().toString(36)}`,
      projectId: project?.id || null,
      projectName: pName,
      category: 'board',
      badge: isEm ? 'EMERGENCY MEETING MINUTES' : 'BOARDROOM MINUTES',
      title: isEm
        ? `Emergency Meeting Resolution: ${pName}`
        : `Executive Boardroom Alignment: ${pName}`,
      author: 'Cali (COO) + 4 Department Directors',
      summary: `${meeting.reason.slice(0, 110)} — Adjourned cleanly and production resumed.`,
      markdown: [
        '## Meeting Metadata',
        `- **Type:** ${isEm ? 'Emergency Meeting' : 'Executive Boardroom'}`,
        `- **Called By:** ${meeting.caller === 'cali' ? 'Cali (COO)' : 'Mark (Founder & CEO)'}`,
        `- **Trigger:** ${meeting.reason}`,
        '',
        '## Executive Discussion & Decisions',
        transcriptMd
      ].join('\n'),
      metrics: [
        { label: 'Attendees', value: '6 Execs' },
        { label: 'Caller', value: meeting.caller === 'cali' ? 'Cali' : 'CEO' },
        { label: 'Outcome', value: 'Resumed' }
      ],
      createdAt: new Date().toISOString()
    };
    onAdjourn(report);
  };

  return (
    <div className={`absolute inset-0 z-50 flex flex-col ${t.shell}`}>
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-current/10 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold truncate">
              PRODUCTION PAUSED / BOARDROOM LIVE
            </span>
          </div>
          <h3 className="text-base font-bold mt-0.5 truncate">
            {meeting.kind === 'emergency' ? 'Emergency Boardroom' : 'Executive Board Meeting'}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleAdjournClick}
          className="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
        >
          Adjourn &amp; Resume
        </button>
      </div>

      {/* Seated Attendees */}
      <div className="px-4 py-2.5 border-b border-current/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-[10px]">
        <span className={`px-2.5 py-1 rounded-full font-semibold shrink-0 ${t.primaryBtn}`}>Cali (COO)</span>
        <span className={`px-2.5 py-1 rounded-full border shrink-0 ${t.surface}`}>Dir. Product</span>
        <span className={`px-2.5 py-1 rounded-full border shrink-0 ${t.surface}`}>Creative Dir.</span>
        <span className={`px-2.5 py-1 rounded-full border shrink-0 ${t.surface}`}>CTO / Eng</span>
        <span className={`px-2.5 py-1 rounded-full border shrink-0 ${t.surface}`}>Dir. Quality</span>
      </div>

      {/* Live Multi-Voice Boardroom Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-xs">
        {lines.map((ln) => (
          <div key={ln.id} className={`rounded-2xl border p-3.5 space-y-1 ${t.surface}`}>
            <div className={`font-semibold ${ln.roleColor}`}>{ln.speaker}</div>
            <p className="opacity-85 leading-relaxed">{ln.text}</p>
          </div>
        ))}
      </div>

      {/* CEO Interjection Composer */}
      <form onSubmit={handleSpeak} className="p-3.5 border-t border-current/10 flex items-center gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Interject as Founder/CEO..."
          className={`flex-1 px-4 py-2.5 rounded-full text-xs border focus:outline-none ${t.input}`}
        />
        <button type="submit" className={`px-4 py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}>
          Speak
        </button>
      </form>
    </div>
  );
};
