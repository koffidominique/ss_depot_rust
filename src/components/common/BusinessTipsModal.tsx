import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useLocation } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckSquare,
  HelpCircle,
  Layers,
  Search,
  X,
} from 'lucide-react';
import { useUiStore } from '../../stores/uiStore.ts';
import {
  BUSINESS_TIPS_TOPICS,
  resolveTopicIdFromPath,
  type TipTopic,
} from '../../data/businessTips.ts';

const TOPIC_GROUPS: Array<TipTopic['group']> = [
  'Commerce & Caisse',
  'Catalogue & Stock',
  'Tiers & Consignations',
  'Pilotage & Système',
];

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
    const preferred =
      filteredTopics.find((t) => t.id === tipsTopicId) ||
      filteredTopics.find((t) => t.id === currentRouteTopicId) ||
      filteredTopics[0] ||
      BUSINESS_TIPS_TOPICS[0];
    return preferred;
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
          {/* En-tête modal */}
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
            {/* Rail gauche : navigation par module */}
            <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 overflow-y-auto p-3 shrink-0">
              <div className="md:hidden">
                <label className="block text-[11px] font-medium text-[#667085] dark:text-slate-400 mb-1">
                  Module ou écran
                </label>
                <select
                  value={activeTopic.id}
                  onChange={(e) => setTipsTopicId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
                >
                  {filteredTopics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden md:block space-y-4">
                {filteredTopics.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-[#667085] dark:text-slate-400">
                    Aucun sujet ne correspond à « {search} ».
                  </p>
                ) : (
                  TOPIC_GROUPS.map((groupName) => {
                    const items = filteredTopics.filter((t) => t.group === groupName);
                    if (items.length === 0) return null;
                    return (
                      <div key={groupName} className="space-y-1">
                        <div className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#667085] dark:text-slate-400">
                          {groupName}
                        </div>
                        {items.map((topic) => {
                          const isSelected = topic.id === activeTopic.id;
                          const isCurrentPage = topic.id === currentRouteTopicId;
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => setTipsTopicId(topic.id)}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                                isSelected
                                  ? 'bg-[#2563EB] font-semibold text-white'
                                  : 'font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span className="truncate">{topic.title}</span>
                              {isCurrentPage && (
                                <span
                                  className={`text-[10px] shrink-0 ${
                                    isSelected ? 'text-blue-100' : 'text-[#2563EB] dark:text-[#60A5FA]'
                                  }`}
                                >
                                  Actuel
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Panneau principal : détails du module sélectionné */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-[#667085] dark:text-slate-400">
                      {activeTopic.group} · Écran {activeTopic.route}
                    </div>
                    <h2 className="font-display text-lg font-semibold text-[#182230] dark:text-slate-100">
                      {activeTopic.title}
                    </h2>
                  </div>
                </div>
                <p className="text-xs text-[#667085] dark:text-slate-400">{activeTopic.subtitle}</p>
              </div>

              {/* Règle d'or — bordure 1px uniforme sans bordure épaisse latérale */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/25 p-4">
                <div className="flex items-start gap-2.5">
                  <HelpCircle className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#182230] dark:text-slate-100">
                      Logique métier essentielle
                    </div>
                    <p className="text-xs leading-relaxed text-[#182230] dark:text-slate-200">
                      {activeTopic.goldenRule}
                    </p>
                  </div>
                </div>
              </div>

              {/* Onglets de filtrage du contenu */}
              <Tabs.Root
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as typeof activeTab)}
                className="space-y-4"
              >
                <Tabs.List className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1">
                  <Tabs.Trigger
                    value="all"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] dark:text-slate-300 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
                  >
                    Tout voir
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="fields"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] dark:text-slate-300 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
                  >
                    Champs des formulaires ({matchingFields.length})
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="tabs"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] dark:text-slate-300 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
                  >
                    Onglets & Flux ({matchingTabs.length})
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="pitfalls"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] dark:text-slate-300 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
                  >
                    Points d’attention ({activeTopic.pitfalls.length})
                  </Tabs.Trigger>
                </Tabs.List>

                {/* Champs des formulaires */}
                {(activeTab === 'all' || activeTab === 'fields') && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#182230] dark:text-slate-100">
                      <CheckSquare className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
                      <h3>Champs de formulaires & impacts de calcul</h3>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                      {matchingFields.map((item, idx) => (
                        <div key={`${item.formName}-${item.field}-${idx}`} className="p-4 space-y-1.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold text-[#182230] dark:text-slate-100">
                              {item.field}
                            </span>
                            <span className="text-[11px] font-medium text-[#667085] dark:text-slate-400">
                              Formulaire · {item.formName}
                            </span>
                          </div>
                          <p className="text-xs text-[#182230] dark:text-slate-200 leading-relaxed">
                            {item.meaning}
                          </p>
                          <p className="text-xs text-[#667085] dark:text-slate-400 leading-relaxed">
                            <span className="font-semibold text-[#182230] dark:text-slate-200">Règle : </span>
                            {item.rule}
                          </p>
                          {item.example && (
                            <p className="font-mono-num text-[11px] text-[#2563EB] dark:text-[#60A5FA] pt-0.5">
                              Exemple : {item.example}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Onglets & Flux */}
                {(activeTab === 'all' || activeTab === 'tabs') && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#182230] dark:text-slate-100">
                      <Layers className="h-4 w-4 text-[#16A36A] dark:text-emerald-400" />
                      <h3>Onglets, vues & enchaînement métier</h3>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                      {matchingTabs.map((tab, idx) => (
                        <div key={`${tab.name}-${idx}`} className="p-4 space-y-1">
                          <div className="text-xs font-semibold text-[#182230] dark:text-slate-100">
                            {tab.name}
                          </div>
                          <p className="text-xs text-[#182230] dark:text-slate-200">{tab.role}</p>
                          <p className="text-xs text-[#667085] dark:text-slate-400">
                            <span className="font-medium text-[#182230] dark:text-slate-300">Quand l’utiliser : </span>
                            {tab.whenToUse}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Points d'attention */}
                {(activeTab === 'all' || activeTab === 'pitfalls') && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#182230] dark:text-slate-100">
                      <AlertCircle className="h-4 w-4 text-[#D9901A] dark:text-amber-400" />
                      <h3>Points d’attention & erreurs évitées</h3>
                    </div>
                    <ul className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-[#182230] dark:text-slate-200">
                      {activeTopic.pitfalls.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="font-mono-num text-[11px] font-semibold text-[#D9901A] dark:text-amber-400 mt-0.5">
                            0{idx + 1}
                          </span>
                          <span className="leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </Tabs.Root>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
