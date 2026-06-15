import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import {
  OverviewSummary, PublicHoliday, RedmineProject,
  SprintSummary, TimeEntry, UserNode
} from '../../dashboard.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.css']
})
export class OverviewComponent implements OnChanges {
  @Input() projects: RedmineProject[] = [];
  @Input() sprints: SprintSummary[] = [];
  @Input() timeEntries: TimeEntry[] = [];
  @Input() hierarchy: UserNode[] = [];
  @Input() holidays: PublicHoliday[] = [];
  @Input() workingDays = 0;

  summary!: OverviewSummary;
  activeSprintList: SprintSummary[] = [];
  upcomingHolidays: PublicHoliday[] = [];
  issueTypeBreakdown: { label: string; count: number; color: string }[] = [];

  ngOnChanges(): void {
    this.compute();
  }

  private compute(): void {
    const allMembers  = this.flattenNodes(this.hierarchy);
    const active      = this.sprints.filter(s => s.status === 'Active');
    const today       = new Date().toISOString().slice(0, 10);

    // members who logged something in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recentUsers  = new Set(
      this.timeEntries
        .filter(e => e.spentOn >= sevenDaysAgo)
        .map(e => e.userName?.toLowerCase().trim())
    );
    const activeMembersToday = allMembers.filter(n =>
      recentUsers.has(n.name.toLowerCase().trim())
    ).length;

    // utilization: logged vs budget across all visible entries
    const weekBudget  = allMembers.length * (this.workingDays || 5) * 8;
    const weekLogged  = this.timeEntries.reduce((s, e) => s + e.hours, 0);

    // sprint health avg
    const sprintHealthAvg = active.length
      ? Math.round(active.reduce((s, sp) =>
          s + (sp.totalIssues ? ((sp.totalIssues - sp.openIssues) / sp.totalIssues) * 100 : 0), 0
        ) / active.length)
      : 0;

    // team at risk (logged < 50% budget)
    const budgetPerMember = (this.workingDays || 5) * 8;
    const memberHours = new Map<string, number>();
    this.timeEntries.forEach(e => {
      const key = e.userName?.toLowerCase().trim() ?? '';
      memberHours.set(key, (memberHours.get(key) ?? 0) + e.hours);
    });

    const teamAtRisk = allMembers
      .map(n => ({
        name: n.name,
        utilization: Math.round(((memberHours.get(n.name.toLowerCase().trim()) ?? 0) / budgetPerMember) * 100)
      }))
      .filter(m => m.utilization < 50)
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, 5);

    // upcoming holidays (next 30 days)
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    this.upcomingHolidays = this.holidays
      .filter(h => h.date >= today && h.date <= in30)
      .slice(0, 4);

    // active sprints list
    this.activeSprintList = active.slice(0, 6);

    // issue type breakdown across all sprints
    const totals = this.sprints.reduce(
      (acc, s) => ({ bugs: acc.bugs + s.bugs, crs: acc.crs + s.crs, stories: acc.stories + s.stories,
                     open: acc.open + s.openIssues }),
      { bugs: 0, crs: 0, stories: 0, open: 0 }
    );

    this.issueTypeBreakdown = [
      { label: 'Bugs',         count: totals.bugs,    color: '#dc2626' },
      { label: 'Change Req.',  count: totals.crs,     color: '#d97706' },
      { label: 'User Stories', count: totals.stories, color: '#2563eb' },
      { label: 'Open Total',   count: totals.open,    color: '#64748b' },
    ];

    this.summary = {
      totalMembers: allMembers.length,
      activeMembersToday,
      totalProjects: this.projects.length,
      activeSprintsCount: active.length,
      totalOpenIssues: totals.open,
      totalBugs: totals.bugs,
      totalCRs: totals.crs,
      totalStories: totals.stories,
      overallUtilization: weekBudget ? Math.round((weekLogged / weekBudget) * 100) : 0,
      weekLoggedHours: Math.round(weekLogged),
      weekBudgetHours: weekBudget,
      sprintHealthAvg,
      teamAtRisk
    };
  }

  private flattenNodes(nodes: UserNode[]): UserNode[] {
    return nodes.flatMap(n => [n, ...this.flattenNodes(n.directReports ?? [])]);
  }

  utilizationColor(pct: number): string {
    if (pct >= 90) return 'green';
    if (pct >= 70) return 'amber';
    return 'red';
  }

  sprintPct(s: SprintSummary): number {
    return s.totalIssues ? Math.round(((s.totalIssues - s.openIssues) / s.totalIssues) * 100) : 0;
  }
}
