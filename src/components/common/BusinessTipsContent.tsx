import * as Tabs from '@radix-ui/react-tabs';
import { AlertCircle, CheckSquare, HelpCircle, Layers } from 'lucide-react';
import type { TipFieldGuide, TipTabGuide, TipTopic } from '../../data/businessTips.ts';

/* ============================================================================
 * Contenu détaillé d'un thème métier (règle d'or, champs, onglets, vigilance)
 * ============================================================================ */

export function BusinessTipsContent({
  activeTopic,
  activeTab,
  onChangeTab,
  matchingFields,
  matchingTabs,
}: {
  activeTopic: TipTopic;
  activeTab: 'all' | 'fields' | 'tabs' | 'pitfalls';
  onChangeTab: (tab: 'all' | 'fields' | 'tabs' | 'pitfalls') => void;
  matchingFields: TipFieldGuide[];
  matchingTabs: TipTabGuide[];
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* En-tête thème */}
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

      {/* Règle d'or métier */}
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

      {/* Onglets de filtrage */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => onChangeTab(v as typeof activeTab)}
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
  );
}
