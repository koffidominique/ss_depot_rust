import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '../../../services/api/createApiClient.ts';

export interface MonthlyDayRow {
  day: string;
  dayNum: string;
  fullDateLabel: string;
  revenue: number;
  collected: number;
  count: number;
}

export function useDashboardData() {
  const qc = useQueryClient();

  const { monthFrom, monthTo, monthLabel, daysInMonth, yearMonth } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
    const rawLabel = format(now, 'MMMM yyyy', { locale: fr });
    return {
      yearMonth: ym,
      monthFrom: `${ym}-01`,
      monthTo: `${ym}-${String(lastDay).padStart(2, '0')}`,
      monthLabel: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
      daysInMonth: lastDay,
    };
  }, []);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.getDashboard(),
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      typeof apiClient.getSettings === 'function'
        ? apiClient.getSettings().catch(() => null)
        : Promise.resolve(null),
  });

  const monthlyReportQuery = useQuery({
    queryKey: ['reports', 'current-month', monthFrom, monthTo],
    queryFn: () => apiClient.getReports(monthFrom, monthTo),
  });

  const onboardingMutation = useMutation({
    mutationFn: (payload: {
      company_name?: string;
      company_legal_name?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
      setup_completed: boolean;
    }) => apiClient.updateSettings(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const monthlyDailyRows = useMemo<MonthlyDayRow[]>(() => {
    const byDay = new Map<string, { revenue: number; collected: number; count: number }>();
    for (const pt of monthlyReportQuery.data?.dailySales ?? []) {
      byDay.set(pt.day, {
        revenue: Number(pt.revenue || 0),
        collected: Number(pt.collected || 0),
        count: Number(pt.count || 0),
      });
    }
    const rows: MonthlyDayRow[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const isoDay = `${yearMonth}-${dd}`;
      const match = byDay.get(isoDay);
      const parsedDate = new Date(`${isoDay}T12:00:00`);
      rows.push({
        day: isoDay,
        dayNum: dd,
        fullDateLabel: format(parsedDate, 'dd MMM yyyy', { locale: fr }),
        revenue: match?.revenue ?? 0,
        collected: match?.collected ?? 0,
        count: match?.count ?? 0,
      });
    }
    return rows;
  }, [monthlyReportQuery.data, daysInMonth, yearMonth]);

  return {
    monthLabel,
    daysInMonth,
    dashboardQuery,
    settingsQuery,
    monthlyReportQuery,
    monthlyDailyRows,
    onboardingMutation,
  };
}
