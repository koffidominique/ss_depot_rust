import type { TipTopic } from '../../data/businessTips.ts';

/* ============================================================================
 * Rail latéral de navigation des modules dans la modale Conseils & Métier
 * ============================================================================ */

const TOPIC_GROUPS: Array<TipTopic['group']> = [
  'Commerce & Caisse',
  'Catalogue & Stock',
  'Tiers & Consignations',
  'Pilotage & Système',
];

export function BusinessTipsSidebar({
  filteredTopics,
  activeTopic,
  currentRouteTopicId,
  search,
  onSelectTopic,
}: {
  filteredTopics: TipTopic[];
  activeTopic: TipTopic;
  currentRouteTopicId: string;
  search: string;
  onSelectTopic: (id: string) => void;
}) {
  return (
    <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 overflow-y-auto p-3 shrink-0">
      {/* Sélecteur mobile */}
      <div className="md:hidden">
        <label className="block text-[11px] font-medium text-[#667085] dark:text-slate-400 mb-1">
          Module ou écran
        </label>
        <select
          value={activeTopic.id}
          onChange={(e) => onSelectTopic(e.target.value)}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
        >
          {filteredTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {/* Liste groupée desktop */}
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
                      onClick={() => onSelectTopic(topic.id)}
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
  );
}
