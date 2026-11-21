import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLocation } from 'react-router-dom';
import { BookOpen, Search, X } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore.ts';
import { BUSINESS_TIPS_TOPICS, resolveTopicIdFromPath } from '../../data/businessTips.ts';
import { BusinessTipsSidebar } from './BusinessTipsSidebar.tsx';
import { BusinessTipsContent } from './BusinessTipsContent.tsx';

/* ============================================================================
 * Modale principale de documentation & conseils métier contextuels
 * ============================================================================ */

export function BusinessTipsModal() {
  const location = useLocation();
  const tipsOpen = useUiStore((s) => s.tipsOpen);
  const tipsTopicId = useUiStore((s) => s.tipsTopicId);
  const closeTips = useUiStore((s) => s.closeTips);
  const setTipsTopicId = useUiStore((s) => s.setTipsTopicId);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'fields' | 'tabs' | 'pitfalls'>('all');

  const currentRouteTopicId = resolveTopicIdFromPath(location.pathname);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return BUSINESS_TIPS_TOPICS;
    return BUSINESS_TIPS_TOPICS.filter((topic) => {
      const hay = [
        topic.title,
        topic.subtitle,
        topic.goldenRule,
        ...topic.tabs.flatMap((t) => [t.name, t.role, t.whenToUse]),
        ...topic.fields.flatMap((f) => [f.formName, f.field, f.meaning, f.rule, f.example || '']),
        ...topic.pitfalls,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [search]);

  const activeTopic = useMemo(() => {
    return (
      filteredTopics.find((t) => t.id === tipsTopicId) ||
      filteredTopics.find((t) => t.id === currentRouteTopicId) ||
      filteredTopics[0] ||
      BUSINESS_TIPS_TOPICS[0]
    );
  }, [filteredTopics, tipsTopicId, currentRouteTopicId]);

  const qLower = search.trim().toLowerCase();

  const matchingFields = useMemo(() => {
    if (!qLower) return activeTopic.fields;
    const filtered = activeTopic.fields.filter((f) =>
      `${f.formName} ${f.field} ${f.meaning} ${f.rule} ${f.example || ''}`
        .toLowerCase()
        .includes(qLower)
    );
    return filtered.length > 0 ? filtered : activeTopic.fields;
  }, [activeTopic, qLower]);

  const matchingTabs = useMemo(() => {
    if (!qLower) return activeTopic.tabs;
    const filtered = activeTopic.tabs.filter((t) =>
      `${t.name} ${t.role} ${t.whenToUse}`.toLowerCase().includes(qLower)
    );
    return filtered.length > 0 ? filtered : activeTopic.tabs;
  }, [activeTopic, qLower]);

  return (
    <Dialog.Root open={tipsOpen} onOpenChange={(open) => !open && closeTips()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] flex h-[84vh] max-h-[780px] w-[94vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-[#182230] dark:text-slate-100 shadow-xl">
          {/* En-tête + barre de recherche */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-6 py-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[#2563EB] dark:text-[#60A5FA] shrink-0">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display text-base font-semibold truncate">
                  Conseils & Logique Métier
                </Dialog.Title>
                <Dialog.Description className="text-xs text-[#667085] dark:text-slate-400 truncate">
                  Explication des champs de formulaires, onglets et règles comptables DEPOTPRO.
                </Dialog.Description>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Chercher un champ, CUMP, retour emballage..."
                  className="w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-[#182230] dark:text-slate-100 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <Dialog.Close
                aria-label="Fermer l'aide"
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>

          {/* Corps à 2 colonnes */}
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <BusinessTipsSidebar
              filteredTopics={filteredTopics}
              activeTopic={activeTopic}
              currentRouteTopicId={currentRouteTopicId}
              search={search}
              onSelectTopic={setTipsTopicId}
            />
            <BusinessTipsContent
              activeTopic={activeTopic}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              matchingFields={matchingFields}
              matchingTabs={matchingTabs}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
