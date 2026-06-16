import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import {
  PublicHoliday, RedmineProject,
  SprintSummary, UserNode
} from '../../dashboard.model';

interface ProjectHealth {
  project: RedmineProject;
  activeCount: number;
  openIssues: number;
  overdueSprints: number;
  closingSoon: number;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.css']
})
export class OverviewComponent implements OnChanges {
  @Input() projects: RedmineProject[] = [];
  @Input() sprints: SprintSummary[] = [];   // active sprints only, from version metadata
  @Input() hierarchy: UserNode[] = [];
  @Input() holidays: PublicHoliday[] = [];

  @Output() navigateToSprints = new EventEmitter<void>();

  // KPI
  totalMembers   = 0;
  dailyCapacityH = 0;
  workingDaysLeft = 0;
  roleCounts: Record<string, number> = {};

  // Panels
  projectHealth:    ProjectHealth[] = [];
  overdueSprints:   SprintSummary[] = [];
  closingThisWeek:  SprintSummary[] = [];
  upcomingHolidays: PublicHoliday[] = [];

  // KPI counts
  totalProjects    = 0;
  activeSprintCount = 0;

  ngOnChanges(): void {
    this.compute();
  }

  private compute(): void {
    const today   = new Date().toISOString().slice(0, 10);
    const in7     = new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10);
    const in30    = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    // ── Team from hierarchy ──────────────────────────────────────────────
    const allMembers = this.flattenNodes(this.hierarchy);
    this.totalMembers    = allMembers.length;
    //this.developers      = allMembers.filter(n => n.role === 'Developer').length;
    //this.managers        = allMembers.filter(n => n.role === 'Manager').length;
    this.dailyCapacityH  = allMembers.reduce((s, n) => s + (n.dailyHours ?? 8), 0);
    this.workingDaysLeft = this.countWorkingDaysLeft();

    this.roleCounts = allMembers.reduce((acc, member) => {
      const role = member.role || 'Unknown';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);


    // ── Sprint bucketing ─────────────────────────────────────────────────
    this.activeSprintCount = this.sprints.length;
    this.overdueSprints    = this.sprints
      .filter(s => s.endDate && s.endDate < today)
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .slice(0, 6);

    this.closingThisWeek = this.sprints
      .filter(s => s.endDate && s.endDate >= today && s.endDate <= in7)
      .sort((a, b) => a.endDate.localeCompare(b.endDate));

    // ── Project health ───────────────────────────────────────────────────
    this.totalProjects = this.projects.length;
    this.projectHealth = this.projects.map(project => {
      const ps = this.sprints.filter(s => s.projectId === project.id);
      return {
        project,
        activeCount:     ps.length,
        openIssues:      ps.reduce((s, x) => s + x.openIssues, 0),
        overdueSprints:  ps.filter(s => s.endDate && s.endDate < today).length,
        closingSoon:     ps.filter(s => s.endDate >= today && s.endDate <= in7).length
      };
    }).filter(p => p.activeCount > 0);   // only projects with active sprints

    // ── Holidays ─────────────────────────────────────────────────────────
    this.upcomingHolidays = this.holidays
      .filter(h => h.date >= today && h.date <= in30)
      .slice(0, 5);
  }

  private countWorkingDaysLeft(): number {
    const now   = new Date();
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
    let count   = 0;
    const cur   = new Date(now);
    while (cur <= end) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  private flattenNodes(nodes: UserNode[]): UserNode[] {
    return nodes.flatMap(n => [n, ...this.flattenNodes(n.directReports ?? [])]);
  }

  daysOverdue(endDate: string): number {
    const diff = new Date().getTime() - new Date(endDate + 'T00:00:00').getTime();
    return Math.floor(diff / 86400000);
  }

  daysUntil(endDate: string): number {
    const diff = new Date(endDate + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0);
    return Math.ceil(diff / 86400000);
  }

  projectInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  onViewSprints(): void {
    this.navigateToSprints.emit();
  }
}
