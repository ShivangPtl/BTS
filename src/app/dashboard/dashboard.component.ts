import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { lastValueFrom } from 'rxjs';
import { AppUserSession, AuthService } from '../core/services/auth.service';
import { HierarchyAccessService } from '../core/services/hierarchy-access.service';
import { RedmineService } from '../core/services/redmine.service';
import { AppView, NavbarComponent } from '../shared/navbar/navbar.component';
import { FocusSelection, HierarchyBarComponent } from './components/hierarchy-bar/hierarchy-bar.component';
import { OverviewComponent } from "./components/overview/overview.component";
import {
  CapacitySnapshot,
  PublicHoliday,
  RedmineProject,
  SprintSummary,
  TimeEntry,
  UserNode,
  WidgetDefinition
} from './dashboard.model';
import { SprintsComponent } from './components/sprints/sprints.component';

interface KpiCard {
  label: string;
  value: string;
  helper: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}

interface ProjectRollup {
  project: RedmineProject;
  logged: number;
  sprints: number;
  openIssues: number;
  utilization: number;
}

interface TimesheetGap {
  name: string;
  expected: number;
  logged: number;
  gap: number;
  status: 'Healthy' | 'Low' | 'Over';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NgApexchartsModule, HierarchyBarComponent, NavbarComponent, OverviewComponent, SprintsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  hierarchy: UserNode[] = [];
  projects: RedmineProject[] = [];
  sprints: SprintSummary[] = [];
  allSprints: SprintSummary[] = [];  // all statuses — used by Sprints page
  timeEntries: TimeEntry[] = [];
  holidays: PublicHoliday[] = [];
  widgets: WidgetDefinition[] = [];

  private today = new Date();

  startDate: string = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toLocaleDateString('en-CA'); // yyyy-MM-dd
  })();

  endDate: string = new Date().toLocaleDateString('en-CA');
  selectedProjectId = 'all';
  selectedView: AppView = 'overview';
  sidebarCollapsed = false;
  apiStatus: 'Mock data' | 'Connected' = 'Mock data';

  capacity: CapacitySnapshot = {
    workingDays: 0,
    holidayCount: 0,
    grossHours: 0,
    holidayDeductionHours: 0,
    budgetHours: 0,
    loggedHours: 0
  };

  kpiCards: KpiCard[] = [];
  projectRollups: ProjectRollup[] = [];
  timesheetGaps: TimesheetGap[] = [];
  projectChartOptions: any;
  taskMixChartOptions: any;
  dateTrendOptions: any;

  // Who/what the Task Mix widget is currently showing — kept in sync with
  // the hierarchy bar's drilldown/selection via (focusChange).
  taskMixFocusName = '';
  taskMixFocusScope: 'subtree' | 'own' = 'subtree';

  session: AppUserSession | null = null;
  visibleHierarchy: UserNode[] = [];
  visibleTimeEntries: TimeEntry[] = [];

  constructor(
    private redmineService: RedmineService,
    private authService: AuthService,
    private hierarchyAccess: HierarchyAccessService,
    private router: Router
  ) {

    // const today = new Date();

    // const monday = new Date(today);
    // const daysSinceMonday = (today.getDay() + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
    // monday.setDate(today.getDate() - daysSinceMonday);

    // const startDate = monday.toISOString().split('T')[0];
    // const endDate = today.toISOString().split('T')[0];

    // console.log(startDate, endDate);
  }

  ngOnInit(): void {
    const session = this.authService.session;

    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    this.session = session;
    this.redmineService.setApiKey(session.apiKey);
    this.apiStatus = 'Connected';
    this.loadDashboardData();
  }

  private applyAccessFilter(): void {
    if (!this.session) return;

    this.visibleHierarchy = this.hierarchyAccess.getVisibleHierarchy(
      this.hierarchy,
      this.session,
      this.timeEntries
    );

    this.visibleTimeEntries = this.hierarchyAccess.getVisibleTimeEntries(
      this.timeEntries,
      this.visibleHierarchy
    );

    // Default Task Mix focus = the logged-in user's own root + their whole
    // visible team, matching the hierarchy bar's initial "Top view" state.
    const root = this.visibleHierarchy[0];
    this.taskMixFocusName = root ? root.name : '';
    this.taskMixFocusScope = 'subtree';
  }

  // ── Keep Task Mix in sync with whatever the hierarchy bar is focused on ──
  onHierarchyFocusChange(selection: FocusSelection): void {
    this.taskMixFocusName = selection.name;
    this.taskMixFocusScope = selection.scope;
    this.configureTaskMixChart(selection.entries);
  }

  onViewChange(view: AppView): void {
    this.selectedView = view;
  }

  isLoading = false;

  async loadDashboardData(): Promise<void> {
    this.isLoading = true;

    // Run everything in parallel — projects, hierarchy, holidays, versions
    const [projectsRes, hierarchy, holidays] = await Promise.all([
      this.redmineService.getProjects(),
      lastValueFrom(this.redmineService.getHierarchy()),
      lastValueFrom(this.redmineService.getPublicHolidays())
    ]);

    this.projects  = projectsRes.projects;
    this.hierarchy = hierarchy;
    this.holidays  = holidays;
    this.isLoading = false;

    this.fetchFilteredData();
  }

  // fetchFilteredData(): void {
  //   this.sprints = this.redmineService.getSprints(this.selectedProjectId);
  //   this.timeEntries = this.redmineService.getSpentTime(this.startDate, this.endDate, this.selectedProjectId);
  //   this.refreshDerivedData();
  // }

  async fetchFilteredData(): Promise<void> {
    // Active sprints only — instant from cache, no closed/planned noise
    this.sprints = this.redmineService.getActiveSprints(this.selectedProjectId);
    // All sprints (Active + Planned + Closed) — for the Sprints page
    this.allSprints = this.redmineService.getSprints(this.selectedProjectId);

    // time entries — fetched by date range, scoped to active sprint date window
    this.isLoading = true;
    this.timeEntries = await this.redmineService.getSpentTime(
      this.startDate,
      this.endDate,
      this.selectedProjectId
    );
    this.isLoading = false;

    this.refreshDerivedData();
  }

  refreshDerivedData(): void {
    this.applyAccessFilter();
    this.capacity = this.redmineService.calculateCapacity(this.startDate, this.endDate, this.hierarchy, this.timeEntries);
    this.kpiCards = this.buildKpis();
    this.projectRollups = this.buildProjectRollups();
    this.timesheetGaps = this.buildTimesheetGaps();
    this.configureCharts();
  }

  onFilterChange(): void {
    this.fetchFilteredData();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  connectRedmine(): void {
    this.redmineService.setApiKey(this.session!.apiKey);
    this.apiStatus = this.redmineService.hasApiKey() ? 'Connected' : 'Mock data';
    this.loadDashboardData();
  }

  get utilization(): number {
    if (!this.capacity.budgetHours) {
      return 0;
    }

    return Math.round((this.capacity.loggedHours / this.capacity.budgetHours) * 100);
  }

  get activeProjectLabel(): string {
    if (this.selectedProjectId === 'all') {
      return 'All Projects';
    }

    return this.projects.find(project => project.id === Number(this.selectedProjectId))?.name ?? 'Selected Project';
  }

  get visibleHolidays(): PublicHoliday[] {
    return this.redmineService.getHolidaysInRange(this.startDate, this.endDate);
  }

  get enabledWidgetCount(): number {
    return this.widgets.filter(widget => widget.enabled).length;
  }

  private buildKpis(): KpiCard[] {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const gap = r2(this.capacity.budgetHours - this.capacity.loggedHours);

    return [
      {
        label: 'Budget Hours',
        value: `${r2(this.capacity.budgetHours)}h`,
        helper: `${r2(this.capacity.holidayDeductionHours)}h deducted for public holidays`,
        tone: 'blue'
      },
      {
        label: 'Logged In Redmine',
        value: `${r2(this.capacity.loggedHours)}h`,
        helper: `${this.utilization}% utilization against budget`,
        tone: this.utilization >= 90 ? 'green' : this.utilization >= 75 ? 'amber' : 'red'
      },
      {
        label: 'Gap / Excess',
        value: `${Math.abs(gap)}h`,
        helper: gap >= 0 ? 'Hours still not logged' : 'Hours above available capacity',
        tone: gap >= 0 ? 'amber' : 'red'
      },
      {
        label: 'Working Days',
        value: `${this.capacity.workingDays}`,
        helper: `${this.capacity.holidayCount} public holiday inside range`,
        tone: 'green'
      }
    ];
  }

  private buildProjectRollups(): ProjectRollup[] {
    return this.projects
      .filter(project => this.selectedProjectId === 'all' || project.id === Number(this.selectedProjectId))
      .map(project => {
        const logged = this.redmineService.sumHours(this.timeEntries.filter(entry => entry.projectId === project.id));
        const projectSprints = this.sprints.filter(sprint => sprint.projectId === project.id);
        const planned = projectSprints.reduce((sum, sprint) => sum + sprint.plannedHours, 0);

        return {
          project,
          logged,
          sprints: projectSprints.length,
          openIssues: projectSprints.reduce((sum, sprint) => sum + sprint.openIssues, 0),
          utilization: planned ? Math.round((logged / planned) * 100) : 0
        };
      });
  }

  private buildTimesheetGaps(): TimesheetGap[] {
    const users = this.flattenUsers(this.hierarchy);

    return users.map(user => {
      const expected = this.capacity.workingDays * (user.dailyHours ?? 8);
      const logged = this.redmineService.sumHours(this.timeEntries.filter(entry => entry.userName.toLowerCase().trim() === user.name.toLowerCase().trim()));
      const gap = expected - logged;
      const status = logged > expected * 1.15 ? 'Over' : logged >= expected * 0.85 ? 'Healthy' : 'Low';

      return {
        name: user.name,
        expected,
        logged,
        gap,
        status
      };
    });
  }

  private configureCharts(): void {
    const projectNames = this.projectRollups.map(item => item.project.name);
    const projectHours = this.projectRollups.map(item => item.logged);
    const dateBuckets = this.buildDateBuckets();

    this.projectChartOptions = {
      series: [{ name: 'Logged Hours', data: projectHours }],
      chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: 'Inter, Segoe UI, sans-serif' },
      colors: ['#2563eb'],
      plotOptions: { bar: { borderRadius: 5, columnWidth: '44%' } },
      dataLabels: { enabled: false },
      xaxis: { categories: projectNames, labels: { style: { colors: '#475569', fontWeight: 600 } } },
      yaxis: { labels: { formatter: (value: number) => `${value}h` } },
      grid: { borderColor: '#e2e8f0' },
      tooltip: { y: { formatter: (value: number) => `${value} hours logged` } }
    };

    // Task Mix defaults to the logged-in user's own visible subtree —
    // it gets refreshed to match drilldown/selection via onHierarchyFocusChange.
    this.configureTaskMixChart(this.visibleTimeEntries);

    this.dateTrendOptions = {
      series: [
        { name: 'Logged Hours', data: dateBuckets.map(item => item.logged) },
        { name: 'Budget Hours', data: dateBuckets.map(item => item.budget) }
      ],
      chart: { type: 'line', height: 300, toolbar: { show: false }, fontFamily: 'Inter, Segoe UI, sans-serif' },
      colors: ['#2563eb', '#16a34a'],
      stroke: { width: [3, 2], curve: 'smooth', dashArray: [0, 5] },
      markers: { size: 4 },
      xaxis: { categories: dateBuckets.map(item => item.date), labels: { style: { colors: '#475569', fontWeight: 600 } } },
      yaxis: { labels: { formatter: (value: number) => `${value}h` } },
      grid: { borderColor: '#e2e8f0' },
      tooltip: { y: { formatter: (value: number) => `${value} hours` } }
    };
  }

  // ── Task Mix: horizontal ranked bar, scoped to whoever is focused ────────
  // Replaces the old donut, which crushed small slices (1-5%) into
  // unreadable slivers once there were 8-12 activity categories.
  private configureTaskMixChart(entries: TimeEntry[]): void {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const issueTypes = [...new Set(entries.map(entry => entry.issueType))];

    let rows = issueTypes
      .map(type => ({
        type,
        hours: r2(this.redmineService.sumHours(entries.filter(e => e.issueType === type)))
      }))
      .filter(row => row.hours > 0)
      .sort((a, b) => b.hours - a.hours);


    const totalHours = rows.reduce((s, r) => s + r.hours, 0);

    rows = rows.filter(row => (row.hours / totalHours) * 100 > 0.5);

    const palette = ['#2563eb', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777', '#64748b', '#7c3aed', '#ea580c', '#0d9488'];

    const manyRows = rows.length > 7;

    this.taskMixChartOptions = {
      series: [{ name: 'Hours', data: rows.map(r => r.hours) }],
      chart: {
        type: 'bar',
        height: Math.max(220, rows.length * 34),
        toolbar: { show: false },
        fontFamily: 'Inter, Segoe UI, sans-serif'
      },
      colors: rows.map((_, i) => palette[i % palette.length]),
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: manyRows ? '65%' : '55%',
          distributed: true,
          borderRadius: 4,
          borderRadiusApplication: 'end',
          dataLabels: { position: 'top' }
        }
      },
      dataLabels: {
        enabled: true,
        textAnchor: 'start',
        offsetX: 4,
        formatter: (val: number) => {
          const pct = Math.round((val / totalHours) * 100);
          return `${r2(val)}h (${pct}%)`;
        },
        style: { fontSize: '11px', fontWeight: 700, colors: ['#334155'] },
        background: { enabled: false }
      },
      xaxis: {
        categories: rows.map(r => r.type),
        labels: { formatter: (v: number) => `${v}h`, style: { colors: '#94a3b8', fontSize: '11px' } }
      },
      yaxis: {
        labels: { style: { colors: '#334155', fontSize: '12px', fontWeight: 600 } }
      },
      grid: { borderColor: '#eef2f7', xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
      legend: { show: false },
      tooltip: {
        y: { formatter: (value: number) => `${r2(value)} hours (${Math.round((value / totalHours) * 100)}%)` }
      }
    };
  }

  private buildDateBuckets(): { date: string; logged: number; budget: number }[] {
    const dailyCapacityHours = this.hierarchy.reduce((sum, node) => sum + this.redmineService.calculateSubtreeDailyHours(node), 0);
    const current = new Date(`${this.startDate}T00:00:00`);
    const end = new Date(`${this.endDate}T00:00:00`);
    const result: { date: string; logged: number; budget: number }[] = [];

    while (current <= end) {
      const date = current.toISOString().slice(0, 10);
      const day = current.getDay();
      const isWeekend = day === 0 || day === 6;
      const isHoliday = this.visibleHolidays.some(holiday => holiday.date === date);

      result.push({
        date: date.slice(5),
        logged: this.redmineService.sumHours(this.timeEntries.filter(entry => entry.spentOn === date)),
        budget: isWeekend || isHoliday ? 0 : dailyCapacityHours
      });

      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  private flattenUsers(nodes: UserNode[]): UserNode[] {
    return nodes.flatMap(node => {
      return [node, ...this.flattenUsers(node.directReports ?? [])];
    });
  }
}
