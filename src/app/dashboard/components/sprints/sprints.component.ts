import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RedmineProject, SprintSummary } from '../../dashboard.model';
import { RedmineService } from '../../../core/services/redmine.service';
import { environment } from '../../../../environments/environment';

// ── Issue status taxonomy ─────────────────────────────────────────────────
// Closed    = fully done (QA accepted)
// Resolved  = dev done, awaiting QA
// In Progress / In progress = actively being worked
// New / Open / Reopened = not started / backlog
// Rejected  = won't fix
export type IssueStatusGroup = 'new' | 'inprogress' | 'resolved' | 'closed' | 'rejected';

export interface SprintIssue {
  id: number;
  subject: string;
  tracker: string;
  status: string;
  statusGroup: IssueStatusGroup;
  priority: string;
  assignee: string;
  startDate: string;
  dueDate: string;
  estimatedHours: number;
  spentHours: number;
  doneRatio: number;
  createdOn: string;
}

export interface TrackerGroup {
  name: string;
  count: number;
  color: string;
  icon: string;
  new: number;
  inprogress: number;
  resolved: number;
  closed: number;
  rejected: number;
}

export interface MemberLoad {
  name: string;
  trackers: Record<string, number>;
  total: number;
  new: number;
  inprogress: number;
  resolved: number;
  closed: number;
  rejected: number;
}

export interface StatusSummary {
  group: IssueStatusGroup;
  label: string;
  count: number;
  color: string;
  bgColor: string;
  icon: string;
}

export interface SprintDetail {
  sprint: SprintSummary;
  issues: SprintIssue[];
  trackerGroups: TrackerGroup[];
  memberLoads: MemberLoad[];
  statusSummary: StatusSummary[];
  loading: boolean;
  error: string | null;
}

// ── Page-level drill-down state ───────────────────────────────────────────
export type PageLevel = 'list' | 'sprint-detail' | 'issue-list';

export interface DrillState {
  level: PageLevel;
  sprint: SprintSummary | null;
  filterLabel: string;       // e.g. "Bugs", "Resolved", "Ritu Shah"
  filterType: 'tracker' | 'status' | 'member' | null;
  filterValue: string | null;
  breadcrumbs: { label: string; level: PageLevel; snapshot?: DrillState }[];
}

const TRACKER_META: Record<string, { color: string; icon: string }> = {
  'Bug':            { color: '#dc2626', icon: 'B' },
  'Feature':        { color: '#7c3aed', icon: 'F' },
  'Userstory':      { color: '#2563eb', icon: 'U' },
  'Task':           { color: '#475569', icon: 'T' },
  'CR':             { color: '#d97706', icon: 'C' },
  'Change Request': { color: '#d97706', icon: 'C' },
  'Support':        { color: '#0d9488', icon: 'S' },
  'Sub-task':       { color: '#64748b', icon: 'S' },
};

const STATUS_GROUPS: Record<string, IssueStatusGroup> = {
  'New':          'new',
  'Open':         'new',
  'Reopened':     'new',
  'Feedback':     'new',
  'In Progress':  'inprogress',
  'In progress':  'inprogress',
  'In Review':    'inprogress',
  'Testing':      'inprogress',
  'Resolved':     'resolved',
  'Closed':       'closed',
  'Done':         'closed',
  'Rejected':     'rejected',
  'Cancelled':    'rejected',
  'Duplicate':    'rejected',
  'Completed':    'closed',
};

const STATUS_META: Record<IssueStatusGroup, { label: string; color: string; bgColor: string; icon: string }> = {
  new:        { label: 'New / Open',      color: '#d97706', bgColor: '#fffbeb', icon: '' },
  inprogress: { label: 'In Progress',     color: '#2563eb', bgColor: '#eff6ff', icon: '' },
  resolved:   { label: 'Resolved',  color: '#7c3aed', bgColor: '#f5f3ff', icon: '' },
  closed:     { label: 'Closed',       color: '#16a34a', bgColor: '#f0fdf4', icon: '' },
  rejected:   { label: 'Rejected',        color: '#64748b', bgColor: '#f8fafc', icon: '' },
};

function classifyStatus(status: string): IssueStatusGroup {
  return STATUS_GROUPS[status] ?? 'new';
}

@Component({
  selector: 'app-sprints',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sprints.component.html',
  styleUrls: ['./sprints.component.css']
})
export class SprintsComponent implements OnChanges, OnInit {
  @Input() sprints: SprintSummary[] = [];
  @Input() projects: RedmineProject[] = [];

  // Filters driven by navbar
  @Input() filterProject = 'all';
  @Input() filterStatus  = 'all';
  @Input() searchQuery   = '';

  // ── Computed list ──────────────────────────────────────────────────────
  filteredSprints: SprintSummary[] = [];

  // ── Drill-down navigation ──────────────────────────────────────────────
  drillState: DrillState = {
    level: 'list',
    sprint: null,
    filterLabel: '',
    filterType: null,
    filterValue: null,
    breadcrumbs: []
  };

  // ── Issue data cache (keyed by sprint.id) ──────────────────────────────
  detailMap = new Map<number, SprintDetail>();

  // ── Issue list view options ────────────────────────────────────────────
  groupByUser = false;

  apiBaseUrl = environment.redmineBase;

  constructor(private redmineService: RedmineService, private http: HttpClient) {}

  ngOnInit(): void { this.applyFilters(); }

  ngOnChanges(changes: SimpleChanges): void {
    // If we changed which sprints are available (e.g. project filter from navbar)
    if (changes['sprints'] || changes['filterProject'] || changes['filterStatus'] || changes['searchQuery']) {
      this.applyFilters();
      // If we're drilled into a sprint that no longer passes the filter, pop back
      if (this.drillState.level !== 'list' && this.drillState.sprint) {
        const still = this.filteredSprints.find(s => s.id === this.drillState.sprint!.id);
        if (!still) this.goToList();
      }
    }
  }

  // ── List filters ────────────────────────────────────────────────────────
  applyFilters(): void {
    let result = [...this.sprints];

    if (this.filterProject !== 'all') {
      result = result.filter(s => s.projectId === Number(this.filterProject));
    }
    if (this.filterStatus !== 'all') {
      result = result.filter(s => s.status === this.filterStatus);
    }
    if (this.searchQuery?.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q)
      );
    }

    const order: Record<string, number> = { Active: 0, Planned: 1, Closed: 2 };
    result.sort((a, b) => {
      const od = (order[a.status] ?? 3) - (order[b.status] ?? 3);
      if (od !== 0) return od;
      return (b.endDate || '').localeCompare(a.endDate || '');
    });

    this.filteredSprints = result;
  }

  // ── Navigation: LIST ← → SPRINT DETAIL ← → ISSUE LIST ────────────────
  goToList(): void {
    this.drillState = { level: 'list', sprint: null, filterLabel: '', filterType: null, filterValue: null, breadcrumbs: [] };
  }

  async openSprint(sprint: SprintSummary): Promise<void> {
    this.drillState = {
      level: 'sprint-detail',
      sprint,
      filterLabel: sprint.name,
      filterType: null,
      filterValue: null,
      breadcrumbs: [{ label: 'All Sprints', level: 'list' }]
    };
    await this.ensureDetail(sprint);
  }

  async openIssueList(filterType: 'tracker' | 'status' | 'member', filterValue: string, label: string): Promise<void> {
    if (!this.drillState.sprint) return;
    this.groupByUser = filterType !== 'member' ? this.groupByUser : false;
    this.drillState = {
      ...this.drillState,
      level: 'issue-list',
      filterType,
      filterValue,
      filterLabel: label,
      breadcrumbs: [
        { label: 'All Sprints', level: 'list' },
        { label: this.drillState.sprint.name, level: 'sprint-detail' }
      ]
    };
  }

  backToSprintDetail(): void {
    if (!this.drillState.sprint) return;
    this.drillState = {
      ...this.drillState,
      level: 'sprint-detail',
      filterType: null,
      filterValue: null,
      filterLabel: this.drillState.sprint.name,
      breadcrumbs: [{ label: 'All Sprints', level: 'list' }]
    };
  }

  navigateBreadcrumb(level: PageLevel): void {
    if (level === 'list') this.goToList();
    else if (level === 'sprint-detail') this.backToSprintDetail();
  }

  // ── Issue loading ──────────────────────────────────────────────────────
  private async ensureDetail(sprint: SprintSummary): Promise<void> {
    if (this.detailMap.has(sprint.id)) return;

    const detail: SprintDetail = {
      sprint, issues: [], trackerGroups: [], memberLoads: [], statusSummary: [], loading: true, error: null
    };
    this.detailMap.set(sprint.id, detail);

    try {
      const raw = await this.fetchIssues(sprint);
      detail.issues       = raw.map(this.mapIssue);
      detail.trackerGroups = this.buildTrackerGroups(detail.issues);
      detail.memberLoads  = this.buildMemberLoads(detail.issues);
      detail.statusSummary = this.buildStatusSummary(detail.issues);
      detail.loading      = false;
    } catch {
      detail.loading = false;
      detail.error   = 'Failed to load sprint issues. Check your Redmine connection.';
    }
  }

  private async fetchIssues(sprint: SprintSummary): Promise<any[]> {
    const PAGE = 100;
    const result: any[] = [];
    let offset = 0, total = Infinity;
    const headers = new HttpHeaders({ 'X-Redmine-API-Key': this.redmineService.getApiKey() });

    while (offset < total) {
      const res = await lastValueFrom(
        this.http.get<{ issues: any[]; total_count: number }>(`${this.apiBaseUrl}/issues.json`, {
          headers,
          params: {
            project_id: sprint.projectId.toString(),
            fixed_version_id: sprint.id.toString(),
            status_id: '*',
            limit: PAGE.toString(),
            offset: offset.toString()
          }
        })
      );
      result.push(...(res.issues ?? []));
      total = res.total_count ?? 0;
      offset += PAGE;
      if (result.length >= 500) break;
    }
    return result;
  }

  private mapIssue = (i: any): SprintIssue => ({
    id: i.id,
    subject: i.subject ?? '',
    tracker: i.tracker?.name ?? 'Task',
    status: i.status?.name ?? '',
    statusGroup: classifyStatus(i.status?.name ?? ''),
    priority: i.priority?.name ?? '',
    assignee: i.assigned_to?.name ?? 'Unassigned',
    startDate: i.start_date ?? '',
    dueDate: i.due_date ?? '',
    estimatedHours: i.estimated_hours ?? 0,
    spentHours: i.spent_hours ?? 0,
    doneRatio: i.done_ratio ?? 0,
    createdOn: i.created_on?.slice(0, 10) ?? ''
  });

  // ── Compute detail sections ────────────────────────────────────────────
  private buildTrackerGroups(issues: SprintIssue[]): TrackerGroup[] {
    const map = new Map<string, SprintIssue[]>();
    for (const i of issues) {
      if (!map.has(i.tracker)) map.set(i.tracker, []);
      map.get(i.tracker)!.push(i);
    }
    const groups: TrackerGroup[] = [];
    map.forEach((items, name) => {
      const meta = TRACKER_META[name] ?? { color: '#64748b', icon: name.charAt(0).toUpperCase() };
      groups.push({
        name, count: items.length, color: meta.color, icon: meta.icon,
        new:        items.filter(i => i.statusGroup === 'new').length,
        inprogress: items.filter(i => i.statusGroup === 'inprogress').length,
        resolved:   items.filter(i => i.statusGroup === 'resolved').length,
        closed:     items.filter(i => i.statusGroup === 'closed').length,
        rejected:   items.filter(i => i.statusGroup === 'rejected').length,
      });
    });
    return groups.sort((a, b) => b.count - a.count);
  }

  private buildMemberLoads(issues: SprintIssue[]): MemberLoad[] {
    const map = new Map<string, MemberLoad>();
    for (const i of issues) {
      const name = i.assignee;
      if (!map.has(name)) map.set(name, { name, trackers: {}, total: 0, new: 0, inprogress: 0, resolved: 0, closed: 0, rejected: 0 });
      const m = map.get(name)!;
      m.total++;
      m.trackers[i.tracker] = (m.trackers[i.tracker] ?? 0) + 1;
      m[i.statusGroup]++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  private buildStatusSummary(issues: SprintIssue[]): StatusSummary[] {
    const groups: IssueStatusGroup[] = ['new', 'inprogress', 'resolved', 'closed', 'rejected'];
    return groups.map(g => ({
      group: g,
      label: STATUS_META[g].label,
      count: issues.filter(i => i.statusGroup === g).length,
      color: STATUS_META[g].color,
      bgColor: STATUS_META[g].bgColor,
      icon: STATUS_META[g].icon
    })).filter(s => s.count > 0);
  }

  // ── Getters for current drill-down ─────────────────────────────────────
  get currentDetail(): SprintDetail | null {
    if (!this.drillState.sprint) return null;
    return this.detailMap.get(this.drillState.sprint.id) ?? null;
  }

  get filteredIssues(): SprintIssue[] {
    const detail = this.currentDetail;
    if (!detail) return [];
    let issues = detail.issues;

    if (this.drillState.filterType === 'tracker' && this.drillState.filterValue) {
      issues = issues.filter(i => i.tracker === this.drillState.filterValue);
    } else if (this.drillState.filterType === 'status' && this.drillState.filterValue) {
      issues = issues.filter(i => i.statusGroup === this.drillState.filterValue);
    } else if (this.drillState.filterType === 'member' && this.drillState.filterValue) {
      issues = issues.filter(i => i.assignee === this.drillState.filterValue);
    }

    return issues;
  }

  get groupedIssues(): { assignee: string; issues: SprintIssue[] }[] {
    const map = new Map<string, SprintIssue[]>();
    for (const i of this.filteredIssues) {
      if (!map.has(i.assignee)) map.set(i.assignee, []);
      map.get(i.assignee)!.push(i);
    }
    return [...map.entries()]
      .map(([assignee, issues]) => ({ assignee, issues }))
      .sort((a, b) => b.issues.length - a.issues.length);
  }

  toggleGroupByUser(): void {
    this.groupByUser = !this.groupByUser;
  }

  // ── Utility ────────────────────────────────────────────────────────────
  trackerColor(name: string): string { return TRACKER_META[name]?.color ?? '#64748b'; }
  trackerIcon(name: string): string  { return TRACKER_META[name]?.icon  ?? name.charAt(0).toUpperCase(); }

  statusMeta(group: IssueStatusGroup) { return STATUS_META[group]; }

  statusTone(status: string): string {
    switch (status) {
      case 'Active':  return 'tone-green';
      case 'Planned': return 'tone-blue';
      case 'Closed':  return 'tone-grey';
      default:        return 'tone-grey';
    }
  }

  progressPct(sprint: SprintSummary): number {
    if (!sprint.totalIssues) return 0;
    return Math.round(((sprint.totalIssues - sprint.openIssues) / sprint.totalIssues) * 100);
  }

  isOverdue(sprint: SprintSummary): boolean {
    if (!sprint.endDate || sprint.status === 'Closed') return false;
    return sprint.endDate < new Date().toISOString().slice(0, 10);
  }

  daysUntil(date: string): number {
    if (!date) return 0;
    return Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  }

  issueStatusClass(sg: IssueStatusGroup): string {
    return `sg-${sg}`;
  }

  priorityClass(p: string): string { return 'prio-' + p.toLowerCase().replace(/\s+/g, '-'); }

  memberTrackerKeys(m: MemberLoad): string[] {
    return Object.keys(m.trackers).sort((a, b) => m.trackers[b] - m.trackers[a]);
  }

  countByStatus(status: string): number {
    let src = this.sprints;
    if (this.filterProject !== 'all') src = src.filter(s => s.projectId === Number(this.filterProject));
    if (this.searchQuery?.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      src = src.filter(s => s.name.toLowerCase().includes(q) || s.projectName.toLowerCase().includes(q));
    }
    if (status === 'all') return src.length;
    return src.filter(s => s.status === status).length;
  }

  trackBySprintId(_: number, s: SprintSummary): number { return s.id; }
  trackByIssueId(_: number, i: SprintIssue): number    { return i.id; }
}